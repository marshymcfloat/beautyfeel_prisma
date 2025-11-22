-- CreateIndex
CREATE INDEX "Attendance_accountId_date_idx" ON "Attendance"("accountId", "date");

-- CreateIndex
CREATE INDEX "AvailedServiceUnit_servedById_servedAt_idx" ON "AvailedServiceUnit"("servedById", "servedAt");

-- CreateIndex
CREATE INDEX "AvailedServiceUnit_servedById_status_servedAt_idx" ON "AvailedServiceUnit"("servedById", "status", "servedAt");

-- CreateIndex
CREATE INDEX "Payslip_accountId_status_idx" ON "Payslip"("accountId", "status");
