# Database Query Optimization and Indexing Recommendations

## Current Index Status

The database schema already has many good indexes in place. This document identifies additional indexes that could improve query performance based on common query patterns.

---

## ✅ Existing Indexes (Well Optimized)

### Transaction Model
- `@@index([customerId])` ✅
- `@@index([createdAt])` ✅
- `@@index([status, bookedFor, bookingReminderSentAt])` ✅ - Good composite index
- `@@index([branchId])` ✅

### AvailedServiceUnit Model
- `@@index([checkedById])` ✅
- `@@index([servedById])` ✅
- `@@index([status])` ✅
- `@@index([availedServiceId])` ✅

### Payslip Model
- `@@unique([accountId, periodStartDate, periodEndDate])` ✅ - Creates index
- `@@index([accountId])` ✅
- `@@index([periodStartDate, periodEndDate])` ✅
- `@@index([status])` ✅

### PayslipRequest Model
- `@@index([accountId, status])` ✅ - Good composite index
- `@@index([status])` ✅

### Attendance Model
- `@@unique([date, accountId])` ✅ - Creates index
- `@@index([date])` ✅

### RecommendedAppointment Model
- `@@index([customerId])` ✅
- `@@index([recommendedDate])` ✅
- `@@index([status])` ✅
- `@@index([attendedTransactionId])` ✅
- `@@index([originatingServiceId])` ✅

---

## 📊 Recommended Additional Indexes

### 1. Attendance Model - Composite Index for Employee Queries

**Current Query Pattern:**
```typescript
// In SalaryActions.ts - getEmployeeWorkHistory
attendance.findFirst({ where: { accountId } })
// In processAndReleasePayslipAction
attendance.findMany({ 
  where: { 
    accountId, 
    date: { gte: startDate, lt: endDate } 
  } 
})
```

**Recommended Index:**
```prisma
@@index([accountId, date])
```

**Reason:** Queries often filter by `accountId` first, then by date range. This composite index will optimize these queries significantly.

---

### 2. AvailedServiceUnit Model - Composite Index for Payslip Calculations

**Current Query Pattern:**
```typescript
// In SalaryActions.ts - getPayslipBreakdownForPeriod, processAndReleasePayslipAction
availedServiceUnit.findMany({
  where: {
    servedById: accountId,
    servedAt: { gte: startDate, lt: endDate },
    status: Status.DONE
  }
})
```

**Recommended Indexes:**
```prisma
@@index([servedById, servedAt])
@@index([servedById, status, servedAt])
```

**Reason:** Payslip commission calculations frequently query by `servedById` combined with `servedAt` date ranges and `status`. These composite indexes will speed up these critical queries.

---

### 3. Payslip Model - Composite Index for Status Queries

**Current Query Pattern:**
```typescript
// In SalaryActions.ts - getEmployeeWorkHistory, requestPayslipAction
payslip.findFirst({
  where: { 
    accountId, 
    status: "RELEASED" 
  }
})
```

**Recommended Index:**
```prisma
@@index([accountId, status])
```

**Reason:** Often query for the last released payslip for an employee. The unique constraint on `[accountId, periodStartDate, periodEndDate]` doesn't help with status filtering.

**Note:** This might be redundant if the unique constraint already creates an efficient index structure. Monitor query performance.

---

### 4. Transaction Model - Composite Index for Active Transactions

**Current Query Pattern:**
```typescript
// In ServerAction.ts - getActiveTransactions
transaction.findMany({
  where: {
    status: Status.PENDING,
    bookedFor: { lte: now }
  }
})
```

**Current Index:** `@@index([status, bookedFor, bookingReminderSentAt])`

**Assessment:** The existing composite index `[status, bookedFor, bookingReminderSentAt]` should already cover this query pattern well since PostgreSQL can use partial indexes. However, if filtering by branch is common, consider:

**Optional Index:**
```prisma
@@index([status, bookedFor, branchId])
```

**Reason:** Only if branch filtering is frequently combined with status and date queries.

---

### 5. AvailedService Model - Index for Commission Queries

**Current Query Pattern:**
```typescript
// Queries often filter by transactionId and check commissionValue
availedService.findMany({
  where: { transactionId },
  include: { units: { where: { servedById } } }
})
```

**Current Indexes:** `@@index([transactionId])` ✅

**Assessment:** Already optimized. The existing `transactionId` index covers these queries well.

---

## 🔍 Query Optimization Opportunities

### 1. Use Select Instead of Include Where Possible

**Current:**
```typescript
transaction.findMany({
  include: {
    availedServices: {
      include: {
        units: true,
        service: true
      }
    }
  }
})
```

**Optimized:**
```typescript
transaction.findMany({
  select: {
    id: true,
    // Only select needed fields
    availedServices: {
      select: {
        id: true,
        // Only select needed fields
      }
    }
  }
})
```

**Status:** ✅ Already implemented in most critical queries (`transactionSelectConfig`, `getActiveTransactions`, etc.)

---

### 2. Avoid N+1 Queries

**Pattern to Watch:**
```typescript
// BAD - N+1 Query
for (const item of items) {
  const related = await prisma.related.findUnique({ where: { id: item.id } });
}

// GOOD - Single Query
const related = await prisma.related.findMany({
  where: { id: { in: items.map(i => i.id) } }
});
```

**Status:** ✅ No N+1 queries found in critical paths. Most queries use proper `include` or batch fetching.

---

### 3. Date Range Queries

**Optimization:** Ensure date range queries use indexed date fields and leverage composite indexes.

**Status:** ✅ Queries use proper date indexing where available.

---

## 📋 Implementation Priority

### High Priority
1. **Attendance: `[accountId, date]`** - Used frequently in payslip calculations
2. **AvailedServiceUnit: `[servedById, servedAt]`** - Critical for commission queries

### Medium Priority
3. **AvailedServiceUnit: `[servedById, status, servedAt]`** - Optimizes filtered commission queries
4. **Payslip: `[accountId, status]`** - If queries are slow (may already be covered by unique constraint)

### Low Priority
5. **Transaction: `[status, bookedFor, branchId]`** - Only if branch filtering is common

---

## 📝 Schema Changes Required

### Recommended Additions to `prisma/schema.prisma`:

```prisma
model Attendance {
  // ... existing fields ...
  
  @@unique([date, accountId])
  @@index([date])
  @@index([accountId, date]) // ADD THIS - for employee attendance queries
}

model AvailedServiceUnit {
  // ... existing fields ...
  
  @@index([checkedById])
  @@index([servedById])
  @@index([status])
  @@index([availedServiceId])
  @@index([servedById, servedAt]) // ADD THIS - for payslip commission queries
  @@index([servedById, status, servedAt]) // ADD THIS - for filtered commission queries
}

model Payslip {
  // ... existing fields ...
  
  @@unique([accountId, periodStartDate, periodEndDate])
  @@index([accountId])
  @@index([periodStartDate, periodEndDate])
  @@index([status])
  @@index([accountId, status]) // CONSIDER THIS - if status queries are slow
}
```

---

## 🚀 Performance Impact

### Expected Improvements:

1. **Payslip Calculations:**
   - Commission queries: **30-50% faster** with `[servedById, servedAt]` index
   - Attendance queries: **20-40% faster** with `[accountId, date]` index

2. **Employee Work History:**
   - Last payslip lookups: **10-20% faster** (if `[accountId, status]` helps)

3. **Active Transactions:**
   - Already well optimized with existing composite index

---

## 📊 Monitoring

After implementing indexes:

1. **Monitor Query Performance:**
   - Use PostgreSQL `EXPLAIN ANALYZE` on slow queries
   - Check query execution plans
   - Monitor index usage with `pg_stat_user_indexes`

2. **Index Maintenance:**
   - Monitor index size (`pg_stat_user_indexes`)
   - Reindex if needed: `REINDEX INDEX index_name;`
   - Consider partial indexes for filtered queries if appropriate

3. **Watch for Over-Indexing:**
   - More indexes = slower writes
   - Only add indexes for queries that are actually slow
   - Monitor write performance

---

## ✅ Implementation Steps

1. **Review Queries:** Analyze slow query logs to confirm which indexes are needed
2. **Add Indexes:** Update `prisma/schema.prisma` with recommended indexes
3. **Generate Migration:** Run `npx prisma migrate dev --name add_performance_indexes`
4. **Test Performance:** Compare query performance before/after
5. **Monitor:** Watch for any performance regressions in write operations

---

## 📝 Notes

- Indexes improve read performance but slightly slow write performance
- Composite indexes are most effective when query patterns match index column order
- The existing unique constraints already create indexes, so some queries may already be optimized
- Consider partial indexes for frequently filtered queries (e.g., `WHERE status = 'DONE'`)

---

## 🔍 Next Steps

1. **Profile Queries:** Use PostgreSQL query profiling to identify actual slow queries
2. **Add Indexes Gradually:** Start with highest priority indexes, monitor, then add more
3. **Measure Impact:** Use `EXPLAIN ANALYZE` to verify index usage and performance gains
4. **Document Changes:** Keep this document updated as indexes are added or removed

