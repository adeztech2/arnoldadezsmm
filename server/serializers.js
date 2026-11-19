export function userView(user) {
  return { id: String(user._id), name: user.name, email: user.email, country: user.country, role: user.role, balance: user.balance, createdAt: user.createdAt, disabled: user.disabled };
}
export function orderView(order, admin = false) {
  const result = {
    id: String(order._id), serviceId: String(order.service), serviceName: order.serviceName, providerOrderId: order.providerOrderId || '',
    link: order.link, quantity: order.quantity, charge: order.charge, refundAmount: order.refundAmount,
    status: order.status, startCount: order.startCount, remains: order.remains,
    createdAt: order.createdAt, updatedAt: order.updatedAt, refill: order.refill, cancel: order.cancel,
    history: order.history || [], fields: order.fields || {}
  };
  if (admin) Object.assign(result, { userId: String(order.user), providerCost: order.providerCost, profit: order.charge - order.refundAmount - order.providerCost });
  return result;
}
export function paymentView(payment) {
  return { id: String(payment._id), reference: payment.reference, gateway: payment.gateway, amount: payment.amount, currency: payment.currency, payAmount: payment.payAmount, payCurrency: payment.payCurrency, status: payment.status, checkoutRequestId: payment.checkoutRequestId || '', createdAt: payment.createdAt };
}
export function transactionView(item) {
  return { id: String(item._id), type: item.type, amount: item.amount, balanceAfter: item.balanceAfter, description: item.description, createdAt: item.createdAt };
}
