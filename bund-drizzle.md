# Drizzle Kit Commands

Proyek ini menggunakan `drizzle-kit` dengan konfigurasi di `drizzle.config.ts`:

- `dialect: "postgresql"`
- `schema: "./src/db/schema.ts"`
- `out: "./src/db/drizzle"`

Gunakan perintah berikut dari akar proyek:

- `bunx drizzle-kit generate`
  - Menghasilkan migrasi atau file yang diperlukan berdasarkan konfigurasi dan schema saat ini.
- `bunx drizzle-kit migrate`
  - Menjalankan migrasi yang belum dieksekusi di database.
- `bunx drizzle-kit push`
  - Mendorong perubahan skema langsung ke database (sesuai konfigurasi dan migrasi).
- `bunx drizzle-kit pull`
  - Menarik skema dari database ke dalam file schema lokal.
- `bunx drizzle-kit check`
  - Memeriksa konsistensi antara schema lokal dan konfigurasi database.
- `bunx drizzle-kit up`
  - Menjalankan semua migrasi yang belum dijalankan dalam urutan sampai selesai.
- `bunx drizzle-kit studio`
  - Membuka antarmuka studio Drizzle untuk menjelajahi database.
- `bunx drizzle-kit export`
  - Mengekspor definisi schema atau migrasi dari database.

Contoh pemakaian:

```sh
bunx drizzle-kit generate
bunx drizzle-kit migrate
bunx drizzle-kit push
```

> Pastikan `DATABASE_URL` telah diatur di environment sebelum menjalankan migrasi atau `push`.
