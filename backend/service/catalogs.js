const SOURCE_CATALOGUE = {
  brokers: [
    { provider: "groww", label: "Groww", desc: "Stocks, MF & ETF portfolio sync", active: false },
    { provider: "kite", label: "Kite (Zerodha)", desc: "Live holdings & order book", active: false },
    { provider: "angelone", label: "AngelOne SmartAPI", desc: "Positions & holdings", active: false },
  ],
  cards: [
    { provider: "mastercard", label: "Mastercard", desc: "Card statements via tokenized feed", active: false },
    { provider: "visa", label: "Visa", desc: "Visa Transaction Services feed", active: false },
    { provider: "amex", label: "American Express", desc: "Amex statement sync", active: false },
  ],
};

const PLANS = [
  {
    id: "free", name: "Free", price: 0, currency: "INR", interval: "month",
    description: "A personal money workspace for getting started.",
    limits: { accounts: null, goals: 3 },
    features: ["Manual transactions, bills and dues", "Multi-currency tracking, budgets and reports", "Manual investment tracking", "Goal planning with priority tools"],
  },
  {
    id: "plus", name: "Plus", price: 99, currency: "INR", interval: "month",
    description: "For an individual managing several accounts and goals.",
    limits: { accounts: null, goals: 20 },
    features: ["Everything in Free", "Up to 20 financial goals", "For an individual with multiple accounts"],
  },
  {
    id: "pro", name: "Pro", price: 199, currency: "INR", interval: "month",
    description: "For an individual managing a larger personal portfolio.",
    limits: { accounts: null, goals: null },
    features: ["Everything in Plus", "Unlimited financial accounts", "Unlimited financial goals", "For a larger personal finance workspace"],
  },
];

module.exports = { SOURCE_CATALOGUE, PLANS };
