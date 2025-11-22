# Comprehensive Refactoring Implementation Guide

## System Understanding

### Core Flows

1. **Transaction Creation (Cashier Flow)**
   - Customer selects services/sets
   - Transaction created with AvailedServices
   - AvailedServiceUnits created (one per quantity)
   - Status: PENDING initially

2. **Service Unit Claiming (Worker Flow)**
   - Workers see pending units
   - Worker claims unit → updates servedBy, servedAt, status to DONE
   - Commission calculated based on servedAt timestamp and role

3. **Attendance Marking**
   - Attendance checked daily
   - Used for base salary calculation in payslips

4. **Payslip Flow**
   - Employee requests payslip → PayslipRequest created
   - Admin reviews and approves
   - Payslip processed and released
   - Calculates: baseSalary (attendance) + commissions (served units) - deductions + bonuses

## Key Improvements Needed

### 1. Timezone Handling ✅ (Already in place)
- `lib/timezoneHelpers.ts` - PHT timezone utilities

### 2. Commission Calculation ✅ (Already unified)
- `lib/salaryCalculationHelpers.ts` - Unified commission calculation

### 3. Needs Improvement

**Backend:**
- Better validation and error handling
- Transactional safety
- Optimized queries
- Consistent error responses

**Frontend:**
- Replace custom components with shadcn where possible
- Add Suspense boundaries
- Better error boundaries
- Improved UX/UI
- Responsive design improvements
- Better loading states
- Toast notifications instead of alerts

**Payslip Logic:**
- Ensure attendance exclusion is correct
- Ensure commission cutoff is correct
- Better period calculation validation

## Refactoring Strategy

### Phase 1: Foundation & Utilities
1. ✅ Timezone helpers (already done)
2. Create validation utilities
3. Create error handling utilities
4. Create toast notification system

### Phase 2: Backend Robustness
1. Enhance transaction creation with better validation
2. Enhance service unit claiming with state checks
3. Ensure commission calculation is correct
4. Enhance attendance marking with timezone safety
5. Enhance payslip flows with proper validation

### Phase 3: Frontend Modernization
1. Replace custom modals with shadcn Dialog
2. Replace custom buttons with shadcn Button
3. Add Toast notifications (sonner already installed)
4. Add Suspense boundaries
5. Improve responsive design
6. Better loading states

### Phase 4: Testing & Optimization
1. Test all flows
2. Optimize queries
3. Performance testing

