# System Refactoring Plan

## System Overview

This is a beauty salon management system that handles:
1. **Transactions**: Customers purchase services/sets → Creates Transactions with AvailedServices and AvailedServiceUnits
2. **Service Unit Claiming**: Workers claim/check units → Updates AvailedServiceUnit status, assigns servedBy/checkedBy
3. **Commission System**: Based on servedAt timestamp, role (MASSEUSE vs others), and transaction discounts
4. **Attendance System**: Daily attendance records for employees
5. **Payslip System**: Request → Approve → Process & Release based on attendance and commissions

## Refactoring Goals

1. **Robustness**: Proper timezone handling, validation, error handling
2. **Maintainability**: Clear code organization, single source of truth
3. **Performance**: Optimized queries, Suspense boundaries, Server Components
4. **UX/UI**: Modern shadcn components, responsive design, better feedback
5. **Accuracy**: Correct commission calculations, attendance tracking, payslip periods

## Architecture Decisions

### Timezone Strategy
- All dates stored in UTC in database
- Philippines Time (PHT) for user-facing dates
- Consistent timezone conversion utilities

### Commission Calculation
- Unified calculation helper function
- Considers transaction-level discounts
- Role-based rates (MASSEUSE vs others)

### Payslip Period Logic
- Starts from last payslip's releasedDate (or first attendance)
- Ends at request time
- Attendance starts day after last payslip periodEndDate
- Commissions start after last payslip releasedDate

## Implementation Phases

### Phase 1: Foundation ✅
- [x] Analyze current system
- [ ] Consolidate timezone utilities
- [ ] Create validation utilities
- [ ] Create error handling utilities

### Phase 2: Backend Server Actions
- [ ] Refactor transaction creation
- [ ] Refactor service unit claiming
- [ ] Refactor commission calculation
- [ ] Refactor attendance marking
- [ ] Refactor payslip request
- [ ] Refactor payslip approval/release

### Phase 3: Frontend Components
- [ ] Refactor Cashier page/components
- [ ] Refactor Work page/components
- [ ] Refactor Attendance management
- [ ] Refactor Payslip management
- [ ] Add Suspense boundaries
- [ ] Improve error boundaries

### Phase 4: Optimization
- [ ] Optimize database queries
- [ ] Add proper indexing
- [ ] Implement caching strategy
- [ ] Performance testing

## Files to Refactor

### Core Utilities
- `lib/timezoneHelpers.ts` - Consolidate timezone functions
- `lib/validation.ts` - Create validation utilities
- `lib/errors.ts` - Create error handling utilities

### Server Actions
- `lib/ServerAction.ts` - Transaction creation, attendance, etc.
- `lib/SalaryActions.ts` - Payslip flows, commission calculation

### Frontend Components
- `app/(logged)/[accountID]/cashier/` - Cashier flow
- `app/(logged)/[accountID]/work/` - Worker flow
- `components/ui/customize/ManagePaySlip.tsx` - Payslip management
- `components/ui/customize/PayslipReviewModal.tsx` - Payslip review

