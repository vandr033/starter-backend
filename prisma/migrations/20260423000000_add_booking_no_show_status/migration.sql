ALTER TABLE `booking`
    MODIFY `status` ENUM('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW') NOT NULL DEFAULT 'CONFIRMED';

UPDATE `booking`
SET
    `status` = 'NO_SHOW',
    `notes` = NULLIF(
        TRIM(
            REPLACE(
                REPLACE(COALESCE(`notes`, ''), '\r', ''),
                '[NO_SHOW]',
                ''
            )
        ),
        ''
    )
WHERE `status` = 'CANCELLED'
  AND COALESCE(`notes`, '') LIKE '%[NO_SHOW]%';
