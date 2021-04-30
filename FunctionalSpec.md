# Opti IoT SRE Test

## Purpose/Responsibilities

Create a set of unit tests to verify [correct functionality of a coffee vending machine](#functional-requirements-for-coffee-vending-machine-to-verify-with-tests).

The coffee vending machine provides the means of ordering one or more customizable cups of
coffee, providing payment, receiving change, and dispensing the correct product.

> [test.ts](test.ts) is provided as a starting point for this task. You can execute tests with `npm test`.

At the end of this exercise, you should have a test suite that you feel confident can determine if a given mocked vending machine meets the [Functional Requirements for Coffee Vending Machines](#functional-requirements-for-coffee-vending-machine-to-verify-with-tests).

## Where To Start

1. Read this document.
2. Look at the [existing tests (Line 211 and below)](test.ts).
3. Verify the tests run by running `npm test`.
4. Two of the tests will fail. Start by making them pass.
   > Finish `createSerialInParser()` beginning on [test.ts Line 175](test.ts). This method provides an eventEmitter (`ee`) and a message queue (`messageQueue`) that should contain parsed messages.
   > Hint: the Event Emitter ("ee") and message queue from `createSerialInParser()` are provided by the `fixturesFactory()` and can be used to write your assertions about the logic of the vending machine.
5. Add more tests to [test.ts](test.ts) to verify the [vending machine functional requirements](#functional-requirements-for-coffee-vending-machine-to-verify-with-tests).
6. When you are comfortable, hand it in (see [README](README.md))!

## Assumptions and Constraints

- Write tests from the perspective of the user of the vending machine.
- To develop and test your unit tests, use a mocked coffee vending machine. Mocked coffee vending machines are software implementations of the [Opti Vending Machine Hardware](#vending-machine-hardware)
  - [Some](src/mockedDevices/mockedVendingMachine.ts) [example](src/mockedDevices/mockedVendingMachine1.ts) [mocked coffee vending machines](src/mockedDevices/mockedVendingMachine2.ts) are provided.
  - [GPIO](src/models/mockedGpioPin.ts) and [Serial communications](src/models/createMockedSerialOutput.ts) are the only interfaces between user and the vending machine.

## Functional Requirements For Coffee Vending Machine To Verify With Tests

- Order coffee in 3 sizes (small for $1.75, medium for $2.00, large for $2.25).
- Allow multiple coffee orders per payment transaction, up to 5 coffees.
- Allow adding money in standard monetary increments only (from $0.05 to $20).
- Allow user to specify the end of a payment transaction and "Dispense" coffee and change.
- “Dispense” coffee when an order is completed if adequate payment has been provided and display money remaining in payment transaction. The developer can assume that the physical implications of this dispense operation always succeed and do not need to be verified - in this context, "dispense" means complete the order.
- Insertion of money is communicated to device by serial message
- Device sends updates to user via events sent via Serial communications
- Does not depend on any external web services.
- Does not require any persistent data storage.
- Only manages 1 coffee order at once. One order may consist of multiple coffees of different sizes. You can assume whatever physical apparatus is connected to the other end of this service prevents more than 1 user from using it at once.

## Vending Machine Hardware

- There are 4 user buttons
  - Add One Small Button
  - Add One Medium Button
  - Add One Large Button
  - Dispense/Cancel Button
    - Dispense is triggered by press & release
    - Cancel is triggered by press & hold > 2 seconds
- There is a serial connection between the user and the vending machine.

## Mocked Vending Machine Implementation Requirements

As mentioned in [Assumptions and Constraints](#assumptions-and-constraints), you are encouraged to use software mocks of the [Vending Machine Hardware](#vending-machine-hardware) to show that your tests work as expected. We have already provided mocked vending machines (see /src/mockedDevices) for examples using the following components:

- The [`MockedGpioPin`](src/models/mockedGpioPin.ts) class for user buttons.

  - A user button can be pressed and released quickly using `button.pressAndReleaseButton()`
  - A user button can be pressed, held for `ms` milliseconds and then released using
    `button.pressHoldAndReleaseButton(ms)`.

- Serial communications will be mocked using [`createMockedSerialOutput()`](src/models/createMockedSerialOutput.ts)

  - See [`fixturesFactory()` in `test.ts`](test.ts)

- Examples of reading serial input:

  - See partially implemented `createSerialInParser()` in [test.ts](test.ts) for an example of how a test fixture reads the vending machine's serial output as input.

  - See [mockedVendingMachine.parseAndHandleSerialInMessages()](src/mockedDevices/mockedVendingMachine1.ts) for an example how a mocked vending machine reads `serialIn` from the user, i.e. the test fixture.

- Examples of writing serial output:
  - See [`addOneToOrder()`](src/mockedDevices/mockedVendingMachine1.ts) for an example of writing a message to serial from a mocked vending machine.

### Specific behaviors of the Mocked Vending Machine (to fulfill [functional requirements](#functional-requirements-for-coffee-vending-machine-to-verify-with-tests)):

- A mocked vending machine that the unit tests runs against will
  implement [`IMockedVendingMachine`](src/mockedDevices/mockedVendingMachine.ts)
- When the machine is initialized, assume the following state values:
  - `order = {0, 0, 0} // zero small, zero medium, zero large coffees`
  - `curFunds = 0 //zero cents`
- When money is added:
  - vending machine sends message for `curFunds`
- When coffee is added (user presses small, medium and/or large buttons):
  - vending machine sends message for `order`
- When dispense is triggered by user and there are insufficient funds:
  - vending machine sends message for `insFunds`
- When dispense is triggered and there are sufficient funds:
  - first vending machine sends messages for `receipt` and `refund` (in this order)
  - then vending machine resets its internal state for `curFunds` and `order`
  - then vending machine sends messages for `curFunds` and `order` (in this order)
- When cancel is triggered:
  - first vending machine sends message for `cancel` and `refund` (in this order)
  - then vending machine resets its internal state for `curFunds` and `order`
  - then vending machine sends messages for `curFunds` and `order` (in this order)
- Numbers are encoded as little-endian unsigned integers of applicable size
- All messages comply with with [Opti Vending Machine Message Protocol](#opti-vending-machine-message-protocol), although they may not perfectly align with the start and end of message chunks.

## Opti Vending Machine Message Protocol

This describes the format of the messages sent over Serial to and from the Opti Vending Machine.

- Each serial message is 3 fields:
  - A `KEY` field of 8 bytes
    - If `Key` is less than 8 bytes, it will padded with `0x0`
  - A `VALUESIZE` field of 2 bytes (`uint16_t`)
  - A `VALUE` field of N bytes where N is the number of bytes defined by valueSize

### Supported Keys:

Messages sent by user and received by vending machine:

- `addValue`: Specifies value of money inserted. Payload is `uint32_t` representing value in cents

Messages sent by vending machine:

- `curFunds`: Specifies the accumulated money inserted. Payload is `uint32_t` representing value in cents
- `order`: Specifies number of small, medium and large coffees respectively. Payload is 3 `uint32_t` values in sequence of small, medium and large coffees.
- `insFunds`: Sent when dispense is triggered and there is insufficient funds for coffees in order. No payload. (`VALUESIZE is 0`)
- `receipt`: Sent when dispense is triggered and there is sufficient funds for coffees in order.
  - 3 x `uint32_t` for coffee counts (small, medium and large)
  - 3 x `uint32_t` for coffee subtotals in cents (small subtotal, medium subtotal, and large subtotal)
  - `uint32_t` for sum (small subtotal + medium subtotal + large subtotal)
  - `uint32_t` for the refund in cents
- `cancel`: Sent when cancel is triggered. No payload. (`VALUESIZE is 0`)
- `refund`: Specifies refund after dispense or cancel is triggered. Payload is `uint32_t` specifiying value in cents.
