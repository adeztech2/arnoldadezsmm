# ADEZ SMM version 1 API contract

This is a standalone Node.js Express app serving plain HTML, CSS, and browser ES modules from public/. No React, Vite, JSX, bundler or third party browser CDNs. Frontend requests use /smm-api. The server and database are built by the parent agent.

All successful responses are JSON; errors are {error: string}. Currency amounts are INTEGER MINOR UNITS (100 cents per unit), unless explicitly stated rate. Format using public settings.walletCurrency. Fetch credentials same-origin. GET /auth/csrf returns {csrfToken}; every POST/PATCH/DELETE sends X-CSRF-Token header. Obtain new token after login/register/logout. API 503 means database/settings unavailable: show honest configuration-needed state. Do not fabricate service/order/balance data.

## Public and authentication
GET /smm-api/public/settings → {siteName, tagline, iconUrl, supportEmail, walletCurrency:"KES", paystackCurrency:"KES", minDeposit:10000, announcement, registrationOpen:true, maintenance:false, configured:boolean}
GET /smm-api/auth/csrf → {csrfToken}
GET /smm-api/auth/me → {user:null | User}
POST /smm-api/auth/register {name,email,password,country:"KE"|ISO two-letter code} → {user:User}. First registration atomically becomes super_admin.
POST /smm-api/auth/login {email,password} → {user:User}
POST /smm-api/auth/logout {} → {message}
POST /smm-api/auth/forgot {email} → {message} generic enumeration-safe response
POST /smm-api/auth/reset {token,password} → {message}
PATCH /smm-api/account {name,country} → {user:User}; country immutable after first payment or order, explain validation errors.
POST /smm-api/account/password {currentPassword,password} → {message}
User = {id,name,email,country,role:"user"|"admin"|"super_admin",balance:integer,createdAt,disabled:boolean}
Password minimum 12 characters, maximum 128.

## Customer dashboard and orders
GET /smm-api/dashboard → {user:User,stats:{totalOrders,activeOrders,completedOrders,totalSpent,totalRefunded},recentOrders:Order[],transactions:Transaction[]}
GET /smm-api/services?q=&category= → {services:Service[],categories:string[],currency}
Service = {id,providerId,name,category,type,min,max,rate:number(selling major currency PER 1000 or per package),enabled,refill,cancel,requirements:string[],description,pricingUnit:"1000"|"package"}
Only currently provider-available, explicitly priced and supported services returned to customers. Admin sees ALL available provider platforms/services with unsupported type notice. Dynamic fields use requirements (link,quantity,comments,usernames,hashtags,username,media,groups,answer_number,keywords,title,description,subscriptions fields as documented). Do not hardcode platforms or promise all types orderable.
GET /smm-api/orders?status=&page= → {orders:Order[],total,page,pages}
POST /smm-api/orders {serviceId,quantity,link,fields:{...},idempotencyKey:crypto.randomUUID()} → {order:Order}
POST /smm-api/orders/bulk {orders:[same fields as single order, unique idempotencyKey each],idempotencyKey:crypto.randomUUID()} → {results:[{order:Order}|{error:string,index:number}],message}; 1–25 items, independent outcomes. UI supports multiple service/quantity/link rows and dynamic fields, not only text bulk.
GET /smm-api/orders/:id → {order:Order}
POST /smm-api/orders/:id/refresh {} → {order:Order}
POST /smm-api/orders/:id/cancel {} → {message,order:Order}; cancellation is a request, never promise instant refund.
POST /smm-api/orders/:id/refill {} → {message,order:Order}
Order = {id,serviceName,serviceId,providerOrderId,link,quantity,charge,refundAmount,status:"Submitting"|"Submission uncertain"|"Pending"|"Processing"|"In progress"|"Completed"|"Partial"|"Canceled"|"Failed",startCount,remains,createdAt,updatedAt,refill,cancel,history:[{status,message,at}],fields}
Unknown submissions are held for admin review, NOT retried or automatically refunded. All refunds return to wallet only (not original payment method).

## Wallet/payments
GET /smm-api/wallet → {balance,currency,transactions:Transaction[],payments:Payment[],gateway:"giftedpay"|"paystack",minDeposit,paystackCurrency,paystackToWalletRate:number}
POST /smm-api/payments {amount:integer WALLET minor units,phone?:string,idempotencyKey} → {payment:Payment,authorizationUrl?:string,message}
Payment = {id,reference,gateway,amount,currency,status:"initializing"|"pending"|"completed"|"failed"|"review",createdAt,checkoutRequestId,payAmount,payCurrency}
Country KE = GiftedPay M-Pesa only; others = Paystack hosted checkout ONLY with channels:["card"]. Redirect browser to authorizationUrl, no inline popup. Exchange conversion configured by admin shown BEFORE paying.
POST /smm-api/payments/:id/verify {} → {payment:Payment,message}
Transaction = {id,type:"deposit"|"order"|"refund"|"adjustment",amount:SIGNED integer,balanceAfter,description,createdAt}
Frontend polls pending GiftedPay every 5 seconds max 24 attempts and offers manual verify afterward. Paystack callback /wallet?reference=xxx: find owned matching payment and verify. Never credit from URL parameters.

## Admin (admin or super_admin)
GET /smm-api/admin/summary → {stats:{users,orders,revenue,providerCost,refunds,profit,pendingPayments},byService:[{serviceId,name,orders,revenue,providerCost,refunds,profit}],recentOrders:Order[],providerBalance:{balance,currency}|null,providerCurrency,providerToWalletRate,lastSyncAt}
Profit = net sales less estimated/provided cost, does not include payment gateway fees. Show estimated label.
GET /smm-api/admin/services?q= → {services:AdminService[],providerCurrency,providerToWalletRate,lastSyncAt}
AdminService = Service + {providerRate:number ORIGINAL provider major currency,providerCurrency,costRate:number WALLET major per pricing unit,sellingRate:number|null,profitRate:number|null,marginPercent:number|null,supported:boolean,available:boolean,updatedAt}
POST /smm-api/admin/services/sync {} → {message,count,providerCurrency,lastSyncAt}; import every available provider service. Persist selling prices during refresh.
PATCH /smm-api/admin/services/:id {sellingRate:number major currency,enabled:boolean} → {service:AdminService}
GET /smm-api/admin/orders?page=&status= → {orders:Order[],total,page,pages}
POST /smm-api/admin/orders/:id/resolve {providerOrderId:string} → {order}; attach verified provider order to uncertain submission; or {confirmNotSubmitted:true,reason:string} to refund after operator checked upstream.
POST /smm-api/admin/orders/:id/refund {totalRefundAmount:integer,reason} → {order}; absolute cumulative refund target, capped to original charge and idempotent, only terminal failed/canceled/partial orders. SUPER_ADMIN ONLY.
GET /smm-api/admin/users?page=&q= → {users:User[],total,page,pages}
PATCH /smm-api/admin/users/:id {disabled:boolean,role:"user"|"admin"} → {user:User}; roles SUPER_ADMIN ONLY and cannot modify super admin.
POST /smm-api/admin/users/:id/balance {amount:SIGNED integer,reason,idempotencyKey:string} → {user:User}; SUPER_ADMIN ONLY, idempotent, bounded, cannot make balance negative.
GET /smm-api/admin/settings → {settings:AdminSettings,integrations:{shakergains:boolean,resend:boolean,giftedpay:boolean,paystack:boolean}}. Never returns secret values.
PATCH /smm-api/admin/settings SUPER_ADMIN ONLY {siteName,tagline,iconUrl:https URL or empty,supportEmail,walletCurrency:"KES" fixed,paystackCurrency,providerToWalletRate:positive,paystackToWalletRate:positive,minDeposit:integer,emailFrom,announcement,registrationOpen,maintenance,defaultMarkupPercent:number,shakergainsApiKey?:string,resendApiKey?:string,giftedpayApiKey?:string,paystackSecretKey?:string} → {message}
AdminSettings contains those public/nonsecret fields plus providerCurrency,lastSyncAt; NO keys. Secret inputs empty means keep existing. Status displays configured only. Do NOT cache secret inputs or write them to localStorage.
POST /smm-api/admin/jobs/run {} → {message,ordersChecked,paymentsChecked,errors:string[]}; reconcile pending orders/payments (and scheduled job alternative for Render/Vercel).
GET /smm-api/admin/audit?page= → {events:[{id,action,actor,target,detail,createdAt}],total,page,pages}
GET /smm-api/admin/payments?page=&status= → {payments:Payment[],total,page,pages}
POST /smm-api/admin/payments/:id/resolve {checkoutRequestId?:string} → {payment:Payment,message}; SUPER_ADMIN ONLY, independently verifies with the gateway. GiftedPay permits attaching a missing checkout ID, but never replacing an existing identifier.
GET /smm-api/jobs/cron requires Authorization: Bearer CRON_SECRET; returns the reconciliation result.

## Requested frontend surfaces
Public landing at /, catalog at /services; polished login/register/forgot/reset at /login /register /forgot-password /reset-password?token=.
Authenticated /dashboard, /new-order, /bulk-orders, /orders, /orders/:id, /wallet, /account.
Admin /admin, /admin/services, /admin/orders, /admin/users, /admin/settings, /admin/audit.
Customer views must NOT expose upstream rates, API keys or profits. Admin service pricing AND overall/by-service profitability are essential. Use real SVG icons and responsive animated professional design without emojis or em dashes. Always show current data/loading/error/empty states and positive action feedback.
