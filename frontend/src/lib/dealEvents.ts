type Handler = (payload: any) => void;

const handlers: Record<string, Handler[]> = {};

export function subscribe(event: string, h: Handler) {
  if (!handlers[event]) handlers[event] = [];
  handlers[event].push(h);
  return () => {
    handlers[event] = handlers[event].filter(fn => fn !== h);
  };
}

export function emit(event: string, payload: any) {
  const list = handlers[event] || [];
  list.forEach(h => {
    try { h(payload); } catch (e) { console.error('dealEvents handler error', e); }
  });
}

const dealEvents = { subscribe, emit };

export default dealEvents;
