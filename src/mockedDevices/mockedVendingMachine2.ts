import {BaseMockedVendingMachine} from './mockedVendingMachine';

//This MockedVendingMachine clearly should not pass a good set of unit tests
//because it does not handle button presses or parse and handle data from serialIn
//=> So this is a useful example to verify your unit tests correctly fail with this
//   poorly implemented Vending Machine
export class MockedVendingMachine extends BaseMockedVendingMachine {}
