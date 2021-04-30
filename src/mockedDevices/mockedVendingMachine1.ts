import {
  BaseMockedVendingMachine,
  IVendingMachineInputs
} from './mockedVendingMachine';

import {MockedGpioPin} from '../models/mockedGpioPin';

import {
  MessageKey,
  createMessageBuffer,
  getMessageKeyFromMessageKeyString
} from '../models/message';

const enum ParseState {
  key,
  valueSizeByte1,
  valueSizeByte2,
  parsingValueField
}

const validCents = new Set<number>([
  5, //5 cents
  10, //10 cents
  25, //25 cents
  50, //50 cents
  100, //$1
  200, //$2
  500, //$5
  1000, //$10
  2000 //$20
]);

export class MockedVendingMachine extends BaseMockedVendingMachine {
  private destroyFns: (() => void)[] = [];

  constructor(inputs: IVendingMachineInputs) {
    super(inputs);

    //Add listeners to GPIO pins for small, medium and large coffees
    for (const [index, btn] of [
      this.smallButton,
      this.mediumButton,
      this.largeButton
    ].entries()) {
      this.destroyFns.push(
        btn.addListenerAndGetRemoveListener(
          MockedGpioPin.pressedAndReleasedEvent,
          () => {
            this.addOneToOrder(index);
          }
        )
      );
    }

    //Listener to handle Dispense and Cancel
    this.destroyFns.push(
      this.dispenseCancelButton.addListenerAndGetRemoveListener(
        MockedGpioPin.pressedAndReleasedEvent,
        (state, duration) => {
          if (duration > 2000) {
            this.cancelOrder();
          } else {
            this.dispenseOrder();
          }
        }
      )
    );

    (async () => {
      try {
        await this.parseAndHandleSerialInMessages();
        // console.log('Serial input to vending machine was closed: Vending Machine stopped.');
      } finally {
        this.destroy();
      }
    })();
  }

  public destroy() {
    if (!this.isDestroyed) {
      super.destroy();

      for (const d of this.destroyFns) {
        try {
          d();
        } catch {
          //proceed to next fn
        }
      }

      this.destroyFns.length = 0;

      //Attempt to stop iterating serialIn (close it)
      (async () => {
        if (typeof this.serialIn.return === 'function') {
          try {
            await this.serialIn.return();
          } catch {
            //Iterator is already stopped
          }
        }
      })();
    }
  }

  public get isDestroyed(): boolean {
    return this.destroyFns.length === 0;
  }

  public get orderSubTotalsInCents(): [number, number, number] {
    return this.order.map(
      (count, i) => MockedVendingMachine.coffeePricesInCents[i] * count
    ) as [number, number, number];
  }

  public get orderTotalInCents(): number {
    let total = 0;
    for (const [i, count] of this.order.entries()) {
      total += MockedVendingMachine.coffeePricesInCents[i] * count;
    }

    return total;
  }

  public get eligibleRefundInCents(): number {
    const refund = this.curFunds - this.orderTotalInCents;
    return refund > 0 ? refund : 0;
  }

  private addOneToOrder(index: number) {
    const sum = this.order[0] + this.order[1] + this.order[2];
    if (sum < 5) {
      //Only accumulate IF sum of coffees will not exceed the maximum of 5
      this.order[index]++;
    }

    //Regardless of whether this.order was updated, send this.orderMessage
    this.writeToSerial(this.orderMessage);
  }

  private get orderMessage(): Buffer {
    const buf = createMessageBuffer(MessageKey.order);
    let offset = 10;
    //Write small, medium and large counts are encoded as little-endian 32bit unsigned integers
    for (const n of this.order) {
      buf.writeUInt32LE(n, offset);
      offset += 4;
    }

    return buf;
  }

  private addFunds(cents: number) {
    if (Number.isSafeInteger(cents) && validCents.has(cents)) {
      this.curFunds += cents;
    }

    this.writeToSerial(this.curFundsMessage);
  }

  private get curFundsMessage(): Buffer {
    const buf = createMessageBuffer(MessageKey.curFunds);
    //write VALUE field for curFunds to the buffer
    buf.writeUInt32LE(this.curFunds, 10);
    return buf;
  }

  private cancelOrder() {
    //* write cancel and refund messages
    this.writeToSerial(this.cancelMessage);
    this.writeToSerial(this.refundMessage);
    //* reset state
    this.resetOrder();
    this.curFunds = 0;
    //* finally write new curFunds and order messages
    this.writeToSerial(this.curFundsMessage);
    this.writeToSerial(this.orderMessage);
  }

  private dispenseOrder() {
    if (this.curFunds < this.orderTotalInCents) {
      this.writeToSerial(this.insFundsMessage);
    } else {
      //Funds are sufficent
      //* write receipt and refund messages
      this.writeToSerial(this.receiptMessage);
      this.writeToSerial(this.refundMessage);
      //* reset state
      this.resetOrder();
      this.curFunds = 0;
      //* finally write new curFunds and order messages
      this.writeToSerial(this.curFundsMessage);
      this.writeToSerial(this.orderMessage);
    }
  }

  private get cancelMessage(): Buffer {
    return createMessageBuffer(MessageKey.cancel);
  }

  private get insFundsMessage(): Buffer {
    return createMessageBuffer(MessageKey.insFunds);
  }

  private get receiptMessage(): Buffer {
    const buf = createMessageBuffer(MessageKey.receipt);
    let offset = 10;
    //Write subtotals for small, medium and large to receipt
    for (const n of this.orderSubTotalsInCents) {
      buf.writeUInt32LE(n, offset);
      offset += 4;
    }

    //Write total to receipt
    buf.writeUInt32LE(this.orderTotalInCents, offset);
    offset += 4;

    //Write refund to receipt
    buf.writeUInt32LE(this.eligibleRefundInCents, offset);
    return buf;
  }

  private get refundMessage(): Buffer {
    const buf = createMessageBuffer(MessageKey.refund);
    //write VALUE field for curFunds to the buffer
    buf.writeUInt32LE(this.eligibleRefundInCents, 10);
    return buf;
  }

  private async parseAndHandleSerialInMessages() {
    let candidateMessage = '';
    let state: ParseState = ParseState.key;
    let key: MessageKey | undefined;
    const valueSizeBytes: Buffer = Buffer.alloc(2);
    let valueSize: number | undefined = 0;
    let value: Buffer | undefined;
    let valueBytesParsed = 0;
    try {
      /*eslint-disable max-depth*/
      for await (const chunk of this.serialIn) {
        if (this.isDestroyed) {
          break; //stop parsing
        }

        if (Buffer.isBuffer(chunk)) {
          for (const byte of chunk.values()) {
            switch (state) {
              case ParseState.key:
                candidateMessage += String.fromCharCode(byte);

                if (candidateMessage.length < 8) {
                  break; //continue to next byte
                } else if (candidateMessage.length > 8) {
                  //Trim last 8 bytes
                  candidateMessage = candidateMessage.slice(-8);
                }

                key = getMessageKeyFromMessageKeyString(candidateMessage);

                if (key !== undefined) {
                  //A known message key was found
                  //* reset candidateMessage and advance state to parse valueSize field
                  candidateMessage = '';
                  state = ParseState.valueSizeByte1;
                }

                break;

              case ParseState.valueSizeByte1:
                valueSizeBytes.writeUInt8(byte);
                state = ParseState.valueSizeByte2;
                break;

              case ParseState.valueSizeByte2:
                valueSizeBytes.writeUInt8(byte, 1);
                valueSize = valueSizeBytes.readUInt16LE();

                if (valueSize === 0) {
                  //There are no message types from serialIn with valueSize 0
                  //that need to be handled
                  //=> proceed to parse next message
                  value = undefined;
                  valueSize = undefined;
                  state = ParseState.key;
                } else {
                  state = ParseState.parsingValueField;
                  value = Buffer.alloc(10 + valueSize);
                }

                valueBytesParsed = 0;
                break;

              case ParseState.parsingValueField:
                if (!value) {
                  throw new Error(
                    'Error parsing serialIn stream. value buffer is undefined'
                  );
                }

                value.writeUInt8(byte, valueBytesParsed);

                ++valueBytesParsed;
                if (valueBytesParsed === valueSize) {
                  if (key === MessageKey.addValue) {
                    this.addFunds(value.readUInt32LE());
                  }

                  value = undefined;
                  state = ParseState.key;
                }

                break;

              default:
                break;
            }
          }
        }
      }
      /*eslint-enable max-depth*/
    } catch (error) {
      console.error('Error parsing serial in');
      console.error(error);
    }
    //If here, serialIn finished yielding chunks (it was closed)
  }
}
