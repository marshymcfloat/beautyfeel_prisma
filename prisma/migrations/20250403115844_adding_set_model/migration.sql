-- CreateTable
CREATE TABLE "ServiceSet" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "price" INTEGER NOT NULL,

    CONSTRAINT "ServiceSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ServiceToSet" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ServiceToSet_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceSet_title_key" ON "ServiceSet"("title");

-- CreateIndex
CREATE INDEX "_ServiceToSet_B_index" ON "_ServiceToSet"("B");

-- AddForeignKey
ALTER TABLE "_ServiceToSet" ADD CONSTRAINT "_ServiceToSet_A_fkey" FOREIGN KEY ("A") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ServiceToSet" ADD CONSTRAINT "_ServiceToSet_B_fkey" FOREIGN KEY ("B") REFERENCES "ServiceSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
