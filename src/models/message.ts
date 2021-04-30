//MessageKey enum
//* A convenience for referencing a Message type
//* Helps constrain types for helper functions below and prevent coding errors
//* Does not get exposed to serial port
export const enum MessageKey {
  addValue = 1, //sent by user
  curFunds = 2, //sent by vending machine
  order = 3, //sent by vending machine
  insFunds = 4, //sent by vending machine
  receipt = 5, //sent by vending machine
  cancel = 6, //sent by vending machine
  refund = 7 //sent by vending machine
}

type MessageDataWithString = [
  string, //Message's KEY as a string
  number | undefined //Message's VALUESIZE field, undefined if not specified
];

type MessageData = [
  MessageKey,
  number | undefined //Message's VALUESIZE field, undefined if not specified
];

const messageDataLookupEntries: [MessageKey, MessageDataWithString][] = [
  [MessageKey.addValue, ['addValue', 4]], //uInt32
  [MessageKey.curFunds, ['curFunds', 4]], //uInt32
  [MessageKey.order, ['order', 12]], //3 * uInt32 = 12
  [MessageKey.insFunds, ['insFunds', 0]],
  [MessageKey.receipt, ['receipt', 32]], //8 * uInt32 = 32
  [MessageKey.cancel, ['cancel', 0]],
  [MessageKey.refund, ['refund', 4]] //uInt32
];

//messageLookupByMessageKey & messageLookupByKeyAsString are not exported to avoid accidentally mutating entries
const messageLookupByMessageKey = new Map<MessageKey, MessageDataWithString>(
  messageDataLookupEntries
);
const messageLookupByKeyAsString = new Map<string, MessageData>(
  messageDataLookupEntries.map(([key, [keyAsString, valueSize]]) => {
    return [keyAsString, [key, valueSize]];
  })
);

export const createMessageBuffer = (
  message: MessageKey,
  valueBuffer?: Buffer
  //if valueBuffer is not specified, VALUE field in buffer is padded with 0 so it can be written to later
): Buffer => {
  const data = messageLookupByMessageKey.get(message);
  if (!data) {
    throw new Error('Unknown message');
  }

  let [keyAsString, valueSize] = data;

  if (Buffer.isBuffer(valueBuffer)) {
    if (valueSize === undefined) {
      valueSize = valueBuffer.byteLength;
    } else if (valueBuffer.byteLength !== valueSize) {
      throw new Error(
        `valueBuffer does not match expected valueSize: valueBuffer is ${valueBuffer.byteLength} bytes and expected value size is ${valueSize} bytes`
      );
    }
  } else if (valueSize === undefined) {
    valueSize = 0;
  }

  //Create buffer:
  //* buffer size is:
  //   Bytes for Message's KEY field
  //   + Bytes for Message's VALUESIZE as uInt16 in bytes
  //   + Bytes for Message's VALUE field
  //   = 8 + 2 + valueSize
  //   = 10 + valueSize
  //* if valueSize > 0, returned buffer is padded with 00
  const buf = Buffer.isBuffer(valueBuffer)
    ? Buffer.concat([Buffer.alloc(10), valueBuffer])
    : Buffer.alloc(10 + valueSize);

  //Write the Message KEY and VALUESIZE fields to buffer
  buf.write(keyAsString, 'ascii');
  buf.writeUInt16LE(valueSize, 8); //little-endian unsigned 16 bit int
  return buf;
};

//Lookup up the expected VALUESIZE field for a message
export const getExpectedMessageValueSize = (
  message: MessageKey
): number | undefined => {
  const data = messageLookupByMessageKey.get(message);
  return data ? data[1] : undefined;
};

//Note: if Message enum is used, then isKnownMessageKey() is unnecessary
export const isKnownMessageKey = (
  messageKey: unknown
): messageKey is MessageKey =>
  //eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  messageLookupByMessageKey.has(messageKey as any);

export const getMessageKeyFromMessageKeyString = (
  messageKeyString: string
): MessageKey | undefined => {
  const zeroPadIndex = messageKeyString.indexOf('\u0000');
  if (zeroPadIndex !== -1) {
    messageKeyString = messageKeyString.slice(0, zeroPadIndex);
  }

  const data = messageLookupByKeyAsString.get(messageKeyString);
  return data ? data[0] : undefined;
};

export const isKnownMessageKeyString = (messageKeyString: string): boolean =>
  getMessageKeyFromMessageKeyString(messageKeyString) !== undefined;

export const getMessageKeyStringFromMessageKey = (
  messageKey: MessageKey
): string | undefined => {
  const data = messageLookupByMessageKey.get(messageKey);
  return data ? data[0] : undefined;
};
