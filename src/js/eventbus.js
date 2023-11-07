
const eventBus = new Comment('apollon-event-bus');

export const eventbus {
  dispatch: (name, content = {}) => {
    eventBus.dispatchEvent(new CustomEvent(name, content));
  },
  addEventListener: (name, cb) => {
    eventBus.addEventListener(name, cb);
  }
}