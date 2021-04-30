import {EventEmitter} from 'eventemitter3';
import {waitFor} from '../utils/waitFor';

//IGPIOOutputView
//* See MockedGpioPin.prototype.outputView
//* When a GPIO pin is wired to a mocked device, state is readonly
//* Only the owner of MockedGpioPin should be able to change the state
//  or press a button.
//* If the pin's state is to be observed, use IGPIOOutputView
export interface IGPIOOutputView
  extends Omit<
    MockedGpioPin,
    | 'state'
    | 'pressAndReleaseButton'
    | 'pressHoldAndReleaseButton'
    | 'destroy'
    | 'reset'
  > {
  readonly state: GPIOState; //re-declare state as readonly (has no setter)
}

export const enum GPIOType {
  input = 0,
  output = 1
}

export const enum GPIOState {
  undefined = -1,
  low = 0,
  high = 1
}

const validStates = new Set<GPIOState>([
  GPIOState.undefined,
  GPIOState.low,
  GPIOState.high
]);

export type IGPIOChangedListener = (state: GPIOState, duration: number) => void;

export class MockedGpioPin {
  public static readonly stateChangeEvent = Symbol('state changed');
  public static readonly pressedAndReleasedEvent = Symbol(
    'pressed and released'
  );

  private ee? = new EventEmitter<symbol>();

  private _outputView?: IGPIOOutputView; //A view of this this.state setter disabled

  private pressCount = 0;

  private previousChangeTime?: number; //ms since unix epoch

  constructor(
    public readonly id: number | string, //pin id
    public readonly type: GPIOType,
    private _state: GPIOState = GPIOState.low //default is low if not specified
  ) {
    //Type checking will ensure _state is valid if specified
    //* But for extra insurance, handle invalid
    if (!validStates.has(_state)) {
      this._state = GPIOState.undefined;
    }

    if (!(type === GPIOType.input || type === GPIOType.output)) {
      //typescript will ensure type is GPIOType
      //* This run time check is extra insurance.
      throw new Error('Unknown GPIO type');
    }
  }

  //A view of this GPIOPin can be created with this.state setter
  //* This is useful when exposing/wiring a GPIO Pin to another device
  //  The other device can only get this.state and should never set state
  //  on a GPIOPin it doesn't own.  So the other device should always be
  //  given this proxy view.
  public get outputView(): IGPIOOutputView {
    if (!this.ee) {
      throw new Error(
        `Cannot get outputView of GPIO "${this.id}" after it was destroyed`
      );
    }

    if (!this._outputView) {
      this._outputView = (new Proxy(this, {
        get: (target, prop, receiver) => {
          if (prop === 'pressAndReleaseButton') {
            throw new Error(
              `Cannot pressAndReleaseButton GPIO "${this.id}" from current context`
            );
          }

          if (prop === 'pressHoldAndReleaseButton') {
            throw new Error(
              `Cannot pressHoldAndReleaseButton GPIO "${this.id}" from current context`
            );
          }

          if (prop === 'destroy') {
            throw new Error(
              `Cannot destroy GPIO "${this.id}" from current context`
            );
          }

          if (prop === 'reset') {
            throw new Error(
              `Cannot reset GPIO "${this.id}" from current context`
            );
          }

          //IMPORTANT: If adding properties, be sure to update IGPIOOutputView

          //otherwise delegate to target's getter
          //* target and receiver will be `this` in typical use cases
          return Reflect.get(target, prop, receiver);
        },
        set: (target, prop, receiver) => {
          if (prop === 'state') {
            throw new Error(
              `Cannot set state of GPIO "${this.id}" from current context`
            );
          }

          //IMPORTANT: If adding properties, be sure to update IGPIOOutputView

          //otherwise delegate to target's setter
          //* target and receiver will be `this` in typical use cases
          return Reflect.set(target, prop, receiver);
        }
      }) as any) as IGPIOOutputView;
    }

    return this._outputView;
  }

  public get state(): GPIOState {
    return this._state;
  }

  public set state(newState: GPIOState) {
    if (!this.ee) {
      throw new Error(
        `Cannot set state of GPIO "${this.id}" after it was destroyed`
      );
    } else if (this.type !== GPIOType.input) {
      throw new Error(
        `Cannot set state of GPIO "${this.id}" when it is set to "input"`
      );
    }

    const previousState = this._state;
    if (previousState !== newState && validStates.has(newState)) {
      this._state = newState;
      const now = Date.now();
      const duration = this.previousChangeTime
        ? now - this.previousChangeTime
        : undefined;
      this.previousChangeTime = now;
      this.ee.emit(MockedGpioPin.stateChangeEvent, newState, duration);
      if (previousState === GPIOState.high && newState === GPIOState.low) {
        //edge detector: changed from high to low
        this.ee.emit(MockedGpioPin.pressedAndReleasedEvent, newState, duration);
      }
    }
  }

  //pressAndReleaseButton()
  //* Simulates triggering a quick press and release of button
  public async pressAndReleaseButton(signal?: AbortSignal): Promise<void> {
    return this.pressHoldAndReleaseButton(20, signal); //hold for short period: 20ms
  }

  //pressHoldAndReleaseButton()
  //* Simulates triggering a press, hold and release of button
  //* If GPIO state is not already low, it does nothing
  //* count and pressCount are tracked to debounce triggering button press and release actions
  public async pressHoldAndReleaseButton(
    ms: number,
    signal?: AbortSignal
  ): Promise<void> {
    if (this.state === GPIOState.low) {
      const count = ++this.pressCount;
      this.state = GPIOState.high;
      await waitFor(ms, signal);
      if (count === this.pressCount) {
        this.state = GPIOState.low;
      }
    }
  }

  public get listeners(): IGPIOChangedListener[] {
    return this.ee ? this.ee.listeners(MockedGpioPin.stateChangeEvent) : [];
  }

  public addListener(eventName: symbol, listener: IGPIOChangedListener): this {
    if (this.ee) {
      this.ee.on(eventName, listener);
    }

    return this;
  }

  public addListenerAndGetRemoveListener(
    eventName: symbol,
    listener: IGPIOChangedListener
  ): () => void {
    if (this.ee) {
      this.ee.on(eventName, listener);
    }

    return this.removeListener.bind(this, eventName, listener);
  }

  public removeListener(
    eventName: symbol,
    listener: IGPIOChangedListener
  ): this {
    if (this.ee) {
      this.ee.off(eventName, listener);
    }

    return this;
  }

  //Add listener that is used at most once
  public once(eventName: symbol, listener: IGPIOChangedListener): this {
    if (this.ee) {
      this.ee.once(eventName, listener);
    }

    return this;
  }

  public removeAllListeners(): this {
    if (this.ee) {
      this.ee.removeAllListeners(MockedGpioPin.stateChangeEvent);
    }

    return this;
  }

  public reset(): this {
    this.removeAllListeners();
    this._state = GPIOState.low;
    this.pressCount = 0;
    delete this.previousChangeTime;
    delete this._outputView;
    return this;
  }

  public destroy() {
    if (this.ee) {
      this.reset();
      delete this.ee;
    }
  }

  public get isDestroyed(): boolean {
    return Boolean(this.ee);
  }
}
