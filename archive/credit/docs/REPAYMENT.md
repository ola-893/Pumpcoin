# Optional delegated repayment

`RepaymentVault` is shared across borrowers, but each borrower owns their deposited balance and delegation. It accepts only `CreditLine.loanToken()` (pUSD in the demo). Collateral remains in the credit line; it is not used to repay debt. `CreditLine.repayFor()` pulls the caller's loan tokens and reduces the specified borrower's debt. Anyone may pay down someone else's debt with their own tokens.

The frontend component in `frontend/components/AutoRepayToggle.tsx` checks the connected borrower and Monad chain before writes. It waits for successful receipts in order: token approval when needed, budget top-up when needed, then delegation. Revocation stops the agent; withdrawal returns unused funds. This is a reusable component, not a deployed Mera frontend or a scheduled relayer service.

Every delegation has a **cumulative** cap until expiry. Repeated calls cannot bypass the cap. There is no automatic monthly reset: renewal requires another borrower signature and resets that grant's spent amount. The UI uses a 30-day grant. CreditLine currently has no contractual monthly installment schedule, so the borrower chooses the cap.

Use a dedicated agent key per borrower. A key already assigned to one borrower cannot be overwritten by another borrower, even after expiry or revocation. Multiple keys belonging to one borrower share that borrower's deposited funds; individual caps do not reserve separate funds. An insufficient balance or excessive debt repayment reverts the entire operation without consuming the grant.

The vault has no generic execution method, native-currency transfer, root controller, or administrator withdrawal. Its immutable credit line receives an unlimited token allowance, as requested. This explicitly trusts that deployed credit line. Both contracts use reentrancy guards and SafeERC20; incoming fee-on-transfer tokens are rejected. These contracts are a test-token hackathon demo, not audited lending infrastructure.

From `contracts`, run `python3 script/local-demo.py`. It verifies the complete flow: 80 pUSD debt → 20 pUSD budget → 10 pUSD grant → 10 pUSD repayment → 70 pUSD debt, cap rejection, revocation rejection, and withdrawal of the unused 10 pUSD.
