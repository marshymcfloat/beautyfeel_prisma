import { Role } from "@prisma/client";

/**
 * UNIFIED COMMISSION CALCULATION HELPER
 * This is the single source of truth for commission calculations.
 *
 * Calculates commission for a single unit based on:
 * - AvailedService original price and quantity
 * - Transaction-level discounts (proportionally distributed)
 * - Employee role (MASSEUSE vs others)
 *
 * @param availedServicePrice - Total price for the AvailedService item
 * @param availedServiceQuantity - Number of units in this AvailedService item
 * @param transactionAvailedServicesPrices - Array of all AvailedService prices in the transaction (for discount distribution)
 * @param transactionGrandTotal - Final grand total of the transaction (after discounts)
 * @param employeeRole - Array of roles for the employee serving the unit
 * @returns Commission amount for a single unit (integer)
 */
export function calculateUnitCommission(
  availedServicePrice: number,
  availedServiceQuantity: number,
  transactionAvailedServicesPrices: number[],
  transactionGrandTotal: number,
  employeeRole: Role[],
): number {
  // Get commission rate based on role
  const SALARY_COMMISSION_RATE = parseFloat(
    process.env.SALARY_COMMISSION_RATE || "0.1",
  );
  const MASSEUSE_COMMISSION_RATE = parseFloat(
    process.env.MASSEUSE_COMMISSION_RATE || "0.5",
  );

  const commissionRate = employeeRole.includes(Role.MASSEUSE)
    ? MASSEUSE_COMMISSION_RATE
    : SALARY_COMMISSION_RATE;

  // Calculate total transaction discount
  const originalSumOfTxnAvailedServicePrices =
    transactionAvailedServicesPrices.reduce(
      (sum, price) => sum + (price ?? 0),
      0,
    );

  const totalTransactionDiscount =
    originalSumOfTxnAvailedServicePrices > 0
      ? Math.max(
          0,
          originalSumOfTxnAvailedServicePrices - transactionGrandTotal,
        )
      : 0;

  // Distribute discount proportionally to this AvailedService
  const asDiscountContribution =
    originalSumOfTxnAvailedServicePrices > 0 && availedServicePrice > 0
      ? (availedServicePrice / originalSumOfTxnAvailedServicePrices) *
        totalTransactionDiscount
      : 0;

  // Calculate effective price (after discount)
  const availedServiceEffectivePrice = Math.max(
    0,
    availedServicePrice - asDiscountContribution,
  );

  // Calculate effective unit price
  const effectiveUnitPriceForCommission =
    availedServiceQuantity > 0
      ? availedServiceEffectivePrice / availedServiceQuantity
      : 0;

  // Calculate and return commission for this unit
  return Math.max(
    0,
    Math.floor(effectiveUnitPriceForCommission * commissionRate),
  );
}

/**
 * Type for AvailedServiceUnit with relations needed for commission calculation
 */
export type AvailedServiceUnitForCommission = {
  id: string;
  servedById: string | null;
  servedBy: { role: Role[] } | null;
  availedService: {
    id: string;
    quantity: number;
    price: number;
    transaction: {
      id: string;
      grandTotal: number;
      availedServices: Array<{ id: string; price: number | null }>;
    };
  };
};

/**
 * Calculate total commission for a set of served units
 * Uses the unified commission calculation logic
 */
export function calculateTotalCommissionForUnits(
  units: AvailedServiceUnitForCommission[],
): number {
  let totalCommission = 0;

  for (const unit of units) {
    const as = unit.availedService;
    const txn = as?.transaction;
    if (!as || !txn || !unit.servedBy) continue;

    // Get all availed service prices for discount calculation
    const transactionAvailedServicesPrices = txn.availedServices.map(
      (s) => s.price ?? 0,
    );

    const unitCommission = calculateUnitCommission(
      as.price,
      as.quantity,
      transactionAvailedServicesPrices,
      txn.grandTotal,
      unit.servedBy.role,
    );

    totalCommission += unitCommission;
  }

  return totalCommission;
}
