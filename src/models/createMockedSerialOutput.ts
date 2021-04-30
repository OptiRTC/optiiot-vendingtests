import {AsyncFifo} from './asyncFifo';

export interface IMockedSerialOutput {
  //AsyncIterableIterator to read data from serial output
  output: AsyncIterableIterator<Buffer>;

  //push data to serial output
  //* data is buffered and will be yielded by `output` in FIFO sequence when output is
  //  iterated over
  push: (chunk: Buffer) => void;

  //destroy the mocked serial output
  //* `output` will stop iterating after destroy() is called
  destroy: () => void;
}

//createMockedSerialOutput() a factory to mock a serial port
//* Note: A serial port's input is simply the output of another IMockedSerialOutput['output']
export const createMockedSerialOutput = (): IMockedSerialOutput => {
  const fifoStream = new AsyncFifo<Buffer>();

  return {
    output: fifoStream[Symbol.asyncIterator](),
    push: (chunk: Buffer) => {
      fifoStream.push(chunk);
    },
    destroy: () => {
      fifoStream.destroy();
    }
  };
};
