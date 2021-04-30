interface IPrivateData<T> {
  buffer: T[];
  stopWait?: () => void;
}

//Tip:
//* Don't get hung up about how this class is implemented
//* Instead, focus on the interface IMockedSerialOutput in 'createMockedSerialOutput.ts'
export class AsyncFifo<T> implements AsyncIterable<T> {
  //cache: private data for each IterableIterator created by this[Symbol.iterator]();
  private readonly cache = new Set<IPrivateData<T>>();

  private isActive?: boolean = true; //deleted when this.destroy() is called

  public push(item: T) {
    //For each asyncIterator created:
    //* push the item to the end of it's FIFO buffer
    //* if the asyncIterator was waiting, stopWaiting
    for (const data of this.cache.values()) {
      data.buffer.push(item);
      this.stopWaiting(data);
    }
  }

  public async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
    //Notes:
    //* consumer of iterator may throw or return early. This is handled in `finally` block.
    //* isActive is tested many times because:
    //  * consumer of iterator may iterate slowly compared to data being pushed into buffer
    //  * this.destroy() may be called while generator is waiting for iterator.next() to be called or
    //    waiting for items to be pushed to buffer
    const buffer: T[] = [];
    const data: IPrivateData<T> = {buffer};
    this.cache.add(data);
    try {
      while (this.isActive) {
        //While there are items in buffer, yield items from front of buffer (FIFO)
        while (buffer.length > 0 && this.isActive) {
          //By inspection: shift() return type is `T | undefined`, but in this context it
          //can't be undefined because of `buffer.length` is not falsey (it is > 0)
          //eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style
          yield buffer.shift() as T;
        }

        if (this.isActive) {
          //buffer is empty, so wait until something is pushed or this.destroy() was called
          //await in loop is accetable in this generator
          //eslint-disable-next-line no-await-in-loop
          await this.createWait(data);
        }
      }
    } finally {
      //Iteration stopped, so cleanup private data for this iterator
      //* if it stopped because this.destroy() was previously called, then this.destroyData() is noop
      this.destroyData(data);
    }
  }

  public destroy() {
    delete this.isActive;
    //destroy the data for each asyncIterator created
    for (const data of this.cache) {
      this.destroyData(data);
    }
  }

  public get isDestroyed() {
    return !this.isActive;
  }

  private destroyData(data: IPrivateData<T>) {
    if (this.cache.has(data)) {
      data.buffer.length = 0;
      this.stopWaiting(data);
      this.cache.delete(data);
    }
  }

  private stopWaiting(data: IPrivateData<T>) {
    const {stopWait} = data;
    if (typeof stopWait === 'function') {
      stopWait();
      delete data.stopWait;
    }
  }

  private async createWait(data: IPrivateData<T>): Promise<void> {
    this.stopWaiting(data); //should be noop, but called in case data.stopWait exists before creating new stopWait
    return new Promise<void>(resolve => {
      data.stopWait = resolve;
    });
  }
}
