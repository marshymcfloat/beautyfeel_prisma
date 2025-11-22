# Database Index Migration Guide

## Overview

This guide explains the new database indexes added to optimize query performance. These indexes are designed to improve performance for common query patterns, especially in payslip calculations and attendance queries.

## New Indexes Added

### 1. Attendance Model - `@@index([accountId, date])`

**Purpose:** Optimizes employee attendance queries that filter by `accountId` first, then by date range.

**Query Pattern Optimized:**
```typescript
// In SalaryActions.ts - processAndReleasePayslipAction
attendance.findMany({
  where: {
    accountId: employeeAccountId,
    date: { gte: startDate, lt: endDate }
  }
})
```

**Performance Impact:**
- **Expected Improvement:** 20-40% faster attendance queries in payslip calculations
- **Write Performance:** Minimal impact (indexes on foreign keys are typically small)

**Migration Command:**
```bash
npx prisma migrate dev --name add_attendance_accountid_date_index
```

---

### 2. AvailedServiceUnit Model - `@@index([servedById, servedAt])`

**Purpose:** Optimizes payslip commission queries that filter by `servedById` and `servedAt` date range.

**Query Pattern Optimized:**
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

**Performance Impact:**
- **Expected Improvement:** 30-50% faster commission queries in payslip calculations
- **Write Performance:** Slight impact on unit serving operations (index maintained on update)

**Migration Command:**
```bash
npx prisma migrate dev --name add_availedserviceunit_servedby_servedat_index
```

---

### 3. AvailedServiceUnit Model - `@@index([servedById, status, servedAt])`

**Purpose:** Optimizes filtered commission queries that combine `servedById`, `status`, and `servedAt` date range.

**Query Pattern Optimized:**
```typescript
// In SalaryActions.ts - Multiple locations
availedServiceUnit.findMany({
  where: {
    servedById: accountId,
    status: Status.DONE,
    servedAt: { gte: startDate, lt: endDate }
  }
})
```

**Performance Impact:**
- **Expected Improvement:** 40-60% faster filtered commission queries
- **Write Performance:** Slight impact on unit status updates

**Migration Command:**
```bash
npx prisma migrate dev --name add_availedserviceunit_servedby_status_servedat_index
```

---

### 4. Payslip Model - `@@index([accountId, status])`

**Purpose:** Optimizes queries for the last released payslip per employee.

**Query Pattern Optimized:**
```typescript
// In SalaryActions.ts - getEmployeeWorkHistory, requestPayslipAction
payslip.findFirst({
  where: {
    accountId: accountId,
    status: "RELEASED"
  },
  orderBy: { periodEndDate: "desc" }
})
```

**Performance Impact:**
- **Expected Improvement:** 10-20% faster last payslip lookups
- **Write Performance:** Minimal impact (status changes are infrequent)

**Note:** This index might be partially covered by the unique constraint `@@unique([accountId, periodStartDate, periodEndDate])`, but the status filter benefits from this composite index.

**Migration Command:**
```bash
npx prisma migrate dev --name add_payslip_accountid_status_index
```

---

## Migration Steps

### 1. Review Schema Changes

The schema has been updated with the new indexes. Review the changes:

```prisma
model Attendance {
  // ... fields ...
  @@index([accountId, date]) // NEW
}

model AvailedServiceUnit {
  // ... fields ...
  @@index([servedById, servedAt]) // NEW
  @@index([servedById, status, servedAt]) // NEW
}

model Payslip {
  // ... fields ...
  @@index([accountId, status]) // NEW
}
```

### 2. Generate Migration

```bash
npx prisma migrate dev --name add_performance_indexes
```

This will:
- Create a new migration file
- Apply the indexes to your database
- Regenerate Prisma Client

### 3. For Production

**Option A: Create Migration File Only**
```bash
npx prisma migrate dev --create-only --name add_performance_indexes
```

Then review the migration file before applying:
```bash
npx prisma migrate deploy
```

**Option B: Apply Directly (Development)**
```bash
npx prisma migrate dev --name add_performance_indexes
```

---

## Performance Testing

### Before Migration

1. **Baseline Queries:**
   - Record query time for payslip calculations
   - Record query time for attendance lookups
   - Record query time for commission queries

### After Migration

1. **Test Same Queries:**
   - Compare query times
   - Verify index usage with `EXPLAIN ANALYZE`
   - Check for any performance regressions

### PostgreSQL Query Analysis

```sql
-- Check if indexes are being used
EXPLAIN ANALYZE
SELECT * FROM "Attendance"
WHERE "accountId" = '...' AND "date" >= '...' AND "date" < '...';

-- Check index usage statistics
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE tablename IN ('Attendance', 'AvailedServiceUnit', 'Payslip')
ORDER BY idx_scan DESC;
```

---

## Expected Query Performance

### Payslip Calculations

**Before:**
- Commission queries: ~200-500ms (depending on data size)
- Attendance queries: ~100-300ms

**After:**
- Commission queries: ~100-250ms (30-50% improvement)
- Attendance queries: ~60-180ms (20-40% improvement)

### Employee Work History

**Before:**
- Last payslip lookup: ~50-100ms

**After:**
- Last payslip lookup: ~40-80ms (10-20% improvement)

---

## Monitoring

### Index Usage Statistics

Monitor index usage to ensure indexes are being utilized:

```sql
-- View index usage
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan as "Index Scans",
  idx_tup_read as "Tuples Read",
  idx_tup_fetch as "Tuples Fetched"
FROM pg_stat_user_indexes
WHERE tablename IN ('Attendance', 'AvailedServiceUnit', 'Payslip')
ORDER BY idx_scan DESC;
```

### Index Size

Monitor index sizes to ensure they're not growing too large:

```sql
-- View index sizes
SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE tablename IN ('Attendance', 'AvailedServiceUnit', 'Payslip')
ORDER BY pg_relation_size(indexrelid) DESC;
```

### Slow Query Monitoring

If you have slow query logging enabled, monitor for any queries that aren't using indexes:

```sql
-- Check for sequential scans (should be minimal)
SELECT
  schemaname,
  tablename,
  seq_scan,
  seq_tup_read,
  idx_scan,
  idx_tup_fetch
FROM pg_stat_user_tables
WHERE tablename IN ('Attendance', 'AvailedServiceUnit', 'Payslip');
```

---

## Rollback Plan

If performance regressions occur:

1. **Remove Indexes:**
   ```prisma
   // In schema.prisma, remove the new index lines
   // Then generate a new migration:
   npx prisma migrate dev --name remove_performance_indexes
   ```

2. **Monitor Write Performance:**
   - Indexes slightly slow down write operations
   - If writes become too slow, consider:
     - Removing less critical indexes
     - Using partial indexes for filtered queries
     - Optimizing write operations separately

---

## Notes

- **Index Maintenance:** PostgreSQL automatically maintains indexes, but you may need to `REINDEX` occasionally if indexes become bloated
- **Partial Indexes:** Consider partial indexes for frequently filtered queries (e.g., `WHERE status = 'DONE'`)
- **Covering Indexes:** If queries frequently return many columns, consider covering indexes (include columns in index itself)
- **Query Optimization:** Indexes help, but also ensure queries are well-written (proper WHERE clauses, avoiding functions on indexed columns)

---

## Next Steps

1. **Apply Migration:** Run `npx prisma migrate dev --name add_performance_indexes`
2. **Test Performance:** Run critical queries and compare performance
3. **Monitor:** Watch for any regressions or issues
4. **Adjust:** Remove or modify indexes if needed based on actual usage patterns

---

## References

- [Prisma Indexes Documentation](https://www.prisma.io/docs/concepts/components/prisma-schema/indexes)
- [PostgreSQL Index Documentation](https://www.postgresql.org/docs/current/indexes.html)
- [PostgreSQL Query Performance](https://www.postgresql.org/docs/current/performance-tips.html)

