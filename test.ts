import test from 'ava';

import {EventEmitter} from 'eventemitter3';
import {MockedGpioPin, GPIOType} from './src/models/mockedGpioPin';
import {
  createMockedSerialOutput,
  IMockedSerialOutput
} from './src/models/createMockedSerialOutput';
import {IVendingMachineInputs} from './src/mockedDevices/mockedVendingMachine';
import {waitFor} from './src/utils/waitFor';

import {
  MessageKey,
  // Note: These could be useful when parsing serialIn
  // getMessageKeyFromMessageKeyString,
  // getMessageKeyStringFromMessageKey,
  createMessageBuffer
} from 'src/models/message';

//Import applicable mocked VendingMachine to test these unit tests against
import {MockedVendingMachine} from './src/mockedDevices/mockedVendingMachine1';

//Additional Mocked VendingMachines may be implemented to test specific unit tests

//The VendingMachine implementation in vendingMachineMock2 is an intentionally flawed
//implementation and is useful for testing unit tests detected it is flawed
// import {MockedVendingMachine} from './src/mockedDevices/mockedVendingMachine2';

//Omit<> error from @typescript-eslint/ban-types is wrong
//* It suggests `Except type in the type-fest package` because it is stricter,
//  but it no longer exists because of: https://github.com/sindresorhus/type-fest/issues/200
//eslint-disable-next-line @typescript-eslint/ban-types
type IUserButtons = Omit<
  Record<keyof IVendingMachineInputs, MockedGpioPin>,
  'serialIn'
>;

//Note: IValueTypeByMessageKey is a lookup value types that you could parse the message's VALUE field into
//* This is just a suggestion
interface IValueTypeByMessageKey {
  [MessageKey.addValue]: never; //This is not a message sent by Vending Machine
  [MessageKey.curFunds]: number;
  [MessageKey.order]: {
    smallCount: number;
    mediumCount: number;
    largeCount: number;
  };
  [MessageKey.insFunds]: undefined; //no VALUE field in message
  [MessageKey.receipt]: {
    smallCount: number;
    mediumCount: number;
    largeCount: number;
    smallSubTotalInCents: number;
    largeSubTotalInCents: number;
    orderTotalInCents: number;
    refundInCents: number;
  };
  [MessageKey.cancel]: undefined; //no VALUE field in message
  [MessageKey.refund]: number;
}

type IParsedMessage<MESSAGEKEY extends MessageKey> = {
  messageKey: MESSAGEKEY;
  valueSize: number;
  value: IValueTypeByMessageKey[MESSAGEKEY];
};

const fixturesFactory = () => {
  const userButtons = Object.fromEntries(
    [
      'smallButton',
      'mediumButton',
      'largeButton',
      'dispenseCancelButton'
    ].map(key => [key, new MockedGpioPin(key, GPIOType.input)])
  ) as IUserButtons;

  const userSerialOut = createMockedSerialOutput();

  const vendingMachineInputs: IVendingMachineInputs = {
    ...(Object.fromEntries(
      Object.entries(userButtons).map(([key, userButton]) => [
        key,
        userButton.outputView
      ])
      //Omit<> error from @typescript-eslint/ban-types is wrong
      //* It suggests `Except type in the type-fest package` because it is stricter,
      //  but it no longer exists because of: https://github.com/sindresorhus/type-fest/issues/200
      //eslint-disable-next-line @typescript-eslint/ban-types
    ) as Omit<IVendingMachineInputs, 'serialIn'>),
    serialIn: userSerialOut.output
  };

  const vendingMachine = new MockedVendingMachine(vendingMachineInputs);

  const destroyVendingMachine = () => {
    vendingMachine.destroy();
  };

  const serialIn = vendingMachine.serialOut; //This is serialIn from perspective of user

  //Note: Do not expose vendingMachine to these tests
  //* Although the vendingMachine may have public methods and properties, these tests
  //  should only be using feedback from `vendingMachine.serialOut` (user's serialIn)
  //* destroyVendingMachine is provided in case there is a vending machine
  //  implementation does not destroy itself when its serialIn (userSerialOut.output)
  //  stop's iterating. (It's not a requirement that it destroy's itself, but it may do so)

  const {ee, messageQueue} = createSerialInParser(serialIn);
  const abortController = new AbortController();
  const abortSignal = abortController.signal;

  return {
    userButtons,
    userSerialOut,
    serialIn,
    destroyVendingMachine,
    ee,
    messageQueue,
    abortController,
    abortSignal //provided as a convenience. (it is on abortController too)
  };
};

const cleanupFixtures = ({
  userButtons,
  userSerialOut,
  //Note: serialIn (from vending machine's serial out) is not destroyable
  destroyVendingMachine,
  ee,
  messageQueue,
  abortController
}: {
  userButtons?: IUserButtons;
  userSerialOut?: IMockedSerialOutput;
  destroyVendingMachine?: () => void;
  ee?: ReturnType<typeof createSerialInParser>['ee'];
  messageQueue?: IParsedMessage<any>[];
  abortController?: AbortController;
} = {}) => {
  if (userButtons) {
    for (const gpioPin of Object.values(userButtons)) {
      gpioPin.destroy();
    }
  }

  if (userSerialOut) {
    userSerialOut.destroy();
  }

  if (destroyVendingMachine) {
    destroyVendingMachine();
  }

  if (ee) {
    ee.removeAllListeners();
  }

  if (Array.isArray(messageQueue)) {
    messageQueue.length = 0;
  }

  if (abortController) {
    //signal abort() to async work that may be pending
    //* No harm if there is no async work is pending
    abortController.abort();
  }
};

//This is a starting point of a parser that parses serialIn from the vending machine
//* This example is just a suggestion
//* If you'd like to take a different approach, you are free to
//  * For example, you may choose not to use EventEmitter
//  * Or you may not use the messageQueue (to push messages to as they are parsed)
const createSerialInParser = (serialIn: AsyncIterableIterator<Buffer>) => {
  //Ideas:
  //* Expose an EventEmitter to your tests that you could use to observe parsed messages as
  //  they are received
  //* Expose messageQueue that you can push parsed messages to as they are received
  const ee = new EventEmitter();
  const messageQueue: IParsedMessage<any>[] = [];

  //Kick off parser
  (async () => {
    try {
      for await (const chunk of serialIn) {
        //To implement: handling the parsing of serialIn so that tests can make
        //assertions about the vending machine's response to user's input

        //Notes:
        //* See src/mockedDevices/mockedVendingMachine1.ts for example of how
        //  a mocked vending machine parses messages from it's serialIn.
        //* The serialIn returns an AsyncIterator; just like a readable stream in nodejs
        //  https://nodejs.org/api/stream.html#stream_readable_symbol_asynciterator

        //emitting chunk may be of interest during development (and should be removed)
        console.log('user serialIn:', chunk);
        ee.emit('receivedChunk', chunk);
      }
    } catch (error) {
      console.error(`Parsing of user's serialIn failed`);
      console.error(error);
    }
  })();

  return {ee, messageQueue};
};

test('Vending Machine handles small coffee button press', async t => {
  const fixtures = fixturesFactory();
  const {userButtons, abortSignal} = fixtures; //extract mocks/fixtures needed
  try {
    await userButtons.smallButton.pressAndReleaseButton(abortSignal);
    //Naive approach to give time for vending machine to react and serialIn parser to process message(s)
    await waitFor(1000, abortSignal);
    t.fail(
      `Not implemented: Expect 'order' message with correct sizes from serialIn`
    );
  } finally {
    cleanupFixtures(fixtures);
  }
});

test('Vending Machine handles adding $1', async t => {
  const fixtures = fixturesFactory();
  const {userSerialOut, abortSignal} = fixtures;
  try {
    const buf = createMessageBuffer(MessageKey.addValue);
    buf.writeUInt32LE(100, 10); //100 cents written at offset 10
    userSerialOut.push(buf);
    await waitFor(1000, abortSignal);
    t.fail(
      `Not implemented: Expect 'curFunds' message with correct value from serialIn`
    );
  } finally {
    cleanupFixtures(fixtures);
  }
});
