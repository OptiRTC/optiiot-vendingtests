import type {IGPIOOutputView} from '../models/mockedGpioPin';

import {
  IMockedSerialOutput,
  createMockedSerialOutput
} from '../models/createMockedSerialOutput';

//Every mocked vending machine to run unit tests against shall implement this interface
export interface IMockedVendingMachine {
  serialOut: AsyncIterator<Buffer>;
}

export interface IVendingMachineInputs {
  smallButton: IGPIOOutputView;
  mediumButton: IGPIOOutputView;
  largeButton: IGPIOOutputView;
  dispenseCancelButton: IGPIOOutputView;
  serialIn: AsyncIterableIterator<Buffer>;
}

export class BaseMockedVendingMachine implements IMockedVendingMachine {
  public static coffeePricesInCents: [number, number, number] = [
    175, //small coffee $1.75
    200, //medium coffee $2.00
    225 //large coffe $2.25
  ];

  protected smallButton: IGPIOOutputView;
  protected mediumButton: IGPIOOutputView;
  protected largeButton: IGPIOOutputView;
  protected dispenseCancelButton: IGPIOOutputView;
  protected serialIn: AsyncIterableIterator<Buffer>;

  protected order: [number, number, number] = [0, 0, 0]; //small, medium large counts
  protected curFunds = 0; //cents added to machine

  //IMPORTANT: Only expose this._serialOut.output publicly
  //* this._serialOut.push() is protected
  private readonly _serialOut: IMockedSerialOutput;

  constructor(inputs: IVendingMachineInputs) {
    this.smallButton = inputs.smallButton;
    this.mediumButton = inputs.mediumButton;
    this.largeButton = inputs.largeButton;
    this.dispenseCancelButton = inputs.dispenseCancelButton;
    this.serialIn = inputs.serialIn;

    this._serialOut = createMockedSerialOutput();
  }

  public destroy() {
    if (this._serialOut) {
      this._serialOut.destroy();
    }
  }

  public get serialOut() {
    return this._serialOut.output;
  }

  protected writeToSerial(data: Buffer) {
    this._serialOut.push(data);
  }

  protected resetOrder() {
    this.order[0] = 0;
    this.order[1] = 0;
    this.order[2] = 0;
  }
}
