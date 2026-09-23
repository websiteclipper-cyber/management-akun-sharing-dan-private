insert into public.site_settings (key, value, label)
values (
  'maintenance_announcement',
  'Saat ini, akun WhatsApp Admin Pastipremium sedang dalam proses peninjauan oleh pihak WhatsApp. Jika Anda sudah mengirim pesan ke nomor sebelumnya, mohon kirim ulang pesan tersebut ke nomor terbaru melalui tombol di bawah ini. Riwayat chat pada nomor sebelumnya untuk sementara belum dapat kami akses.',
  'Pengumuman Penting Maintenance'
)
on conflict (key) do nothing;
