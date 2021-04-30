# Opti Embedded Vending Machine Functional Specification

## Purpose/Responsibilities

Create a set of unit tests to verify correct functionality of a coffee vending machine.

The coffee vending machine provides the means of ordering one or more customizable cups of
coffee, providing payment, receiving change, and dispensing the correct product.

> [test.ts](test.ts) is provided as a starting point for this task. You can execute tests with `npm test`.

## Assumptions and Constraints

- The tests will be written from the perspective of the user of the vending machine.
- To develop and test your unit tests, use a mocked coffee vending machine.
  - Some example mocked coffee vending machines are provided.
  - You should create some mocks of incorrectly implemented coffee vending machines to demonstrate
    your unit tests correctly identifies problems with the incorrect implementation. (test your tests)
- GPIO and Serial communications between the user and vending machine will be mocked.
- Does not depend on any external web services.
- Does not require any persistent data storage.
- Only manages 1 coffee order at once. One order may consist of multiple coffees of different sizes. You can assume whatever physical apparatus is connected to the other end of this service prevents more than 1 user from using it at once.

## Functional Requirements For Vending Machine

- Order coffee in 3 sizes (small for $1.75, medium for $2.00, large for $2.25).
- Allow multiple coffee orders per payment transaction, up to 5 coffees.
- Allow adding money in standard monetary increments only (from $0.05 to $20).
- Allow user to specify the end of a payment transaction and "Dispense" coffee and change.
- “Dispense” coffee when an order is completed if adequate payment has been provided and display money remaining in payment transaction. The developer can assume that the physical implications of this dispense operation always succeed and do not need to be verified - in this context, "dispense" means complete the order.
- Insertion of money is communicated to device by serial message
- Device sends updates to user via events sent via Serial communications

## Implementation Requirements

- There are 4 user buttons

  - Small Button
  - Medium Button
  - Large Button
  - Dispense/Cancel Button
    - Dispense will be triggered by press & release
    - Cancel will be triggered by press & hold > 2 seconds

- The user buttons will be mocked using the [`MockedGpioPin`](src/models/mockedGpioPin.ts) class

  - A user button can be pressed and released quickly using `button.pressAndReleaseButton()`
  - A user button can be pressed, held for `ms` milliseconds and then released using
    `button.pressHoldAndReleaseButton(ms)`

- To mock wiring the user buttons to the mocked vending machine, output views of
  each button are provided to the mocked vending machine's constructor

  > See [BaseMockedVendingMachine](src/mockedDevices/mockedVendingMachine.ts) for example
  > of how the buttons are provided to its constructor.

- Serial communications are used to:

  - Signal to the vending machine that money was added by the user
  - To communicate actions back to the user from the vending machine

- Serial communications will be mocked using [`createMockedSerialOutput()`](src/models/createMockedSerialOutput.ts)

  > `createMockedSerialOutput()` is a factory that provides an `AsyncIterator` of the serial's
  > output stream and a `push()` method to write data to the serial output.

  - Examples:

    - Create serial output from the user to the vending machine.

      > See [test.ts](test.ts) for an example.
      >
      > - In `fixturesFactory()`, `userSerialOut` is created with `createMockedSerialOutput()`
      > - `userSerialOut.output` is provided as serial input to the mocked mocked vending
      >   machine's constructor.
      > - To write to `userSerialOut`, use `userSerialOut.push(data)`

    - Create serial output from the vending machine to the user

      > See [class `BaseMockedVendingMachine`](src/mockedDevices/mockedVendingMachine.ts) for example
      > of how to create serial output for the vending machine. This base class can be used to
      > extend your `MockedVendingMachine`

      > Then see [test.ts](test.ts), where the vending machine's serialOut is
      > provided as the `serialIn` for the user tests.

- Example of reading vending machine's serial output:

  > See partially implemented `createSerialInParser()` in [test.ts](test.ts)

  > As well, see [mockedVendingMachine.parseAndHandleSerialInMessages()](src/mockedDevices/mockedVendingMachine1.ts)
  > from the perspective of parsing `serialIn` to the mocked vending machine.

- Vending Machine expectations from perspective of user:
  - A mocked vending machine that the unit tests runs against will
    implement [`IMockedVendingMachine`](src/mockedDevices/IMockedVendingMachine)
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

## Opti Vending Machine Message Protocol

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
