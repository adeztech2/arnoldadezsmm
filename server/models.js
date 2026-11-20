const implementation = process.env.NODE_ENV === 'test'
  ? await import('./mongo-models.js')
  : await import('./mysql-models.js');

export const { User, Session, Settings, Service, Order, Transaction, Payment, Audit, RateLimit, models } = implementation;
