-- CreateTable
CREATE TABLE "whatsapp_event_group" (
    "id" SERIAL NOT NULL,
    "group_event_id" INTEGER NOT NULL,
    "group_jid" VARCHAR(64) NOT NULL,
    "group_name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_event_group_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_event_group_group_event_id_idx" ON "whatsapp_event_group"("group_event_id");

-- AddForeignKey
ALTER TABLE "whatsapp_event_group" ADD CONSTRAINT "whatsapp_event_group_group_event_id_fkey" FOREIGN KEY ("group_event_id") REFERENCES "group_event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
