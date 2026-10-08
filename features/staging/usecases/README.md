# Use case của tính năng staging

Chờ use case từ D5. Khi có, đặt mỗi use case thành một file Markdown (`.md`) trong thư mục này.
Skill `/gen-testcases staging` sẽ đọc các file này để sinh `features/staging/testcases.json`.

Không ghi credential vào use case. Credential nằm trong `features/staging/.env`.
