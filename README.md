# Ombor nazorati

Bazalt paxta (EKOBAZALT) tayyor mahsulot ombori uchun veb-ilova: yorliq (QR) bo‘yicha qabul va chiqim, qoldiqlar, yuk xati, hisobotlar (Ware House kitobi shaklida), mijozlar va agentlar.

- **Sayt:** https://mhmuhiddinov-png.github.io/OMBOR-NAZORATI/ (GitHub Pages, `docs/` papkasidan)
- **Ma’lumotlar bazasi va kirish:** Firebase loyihasi `ombor-nazorati-eaedc` (Firestore, Email/Password)
- **Kirish:** telefon raqami + parol (SMS yuborilmaydi)
- **Chop etish:** «Chop etish» tugmasi printer oynasini to‘g‘ridan-to‘g‘ri ochadi (A4, albom yoki kitob)

## Fayllar

| Fayl | Nima |
|---|---|
| `docs/index.html` | Ilovaning o‘zi |
| `docs/shim.js` | Firebase bilan ulanish, kirish / ro‘yxatdan o‘tish oynasi |
| `docs/firebase-config.js` | Firebase loyihasi identifikatori (maxfiy emas) |
| `firestore.rules` | Kim nimani o‘qiy va yoza olishi. Firebase konsoli → Firestore → Rules ga qo‘yilgan |
| `firebase.json`, `.firebaserc` | Keyinchalik Firebase Hosting ga o‘tmoqchi bo‘lsangiz (`firebase deploy`) |

`data/claude-export.json` (claude.ai dagi katalog, mijozlar, agentlar, mashinalar) GitHub’ga **yuklanmaydi** — unda haydovchi pasport raqamlari bor. U faqat kompyuteringizdagi `ombor-nazorati\data` papkasida.

## O‘zgartirish kiritish

`docs/` dagi faylni GitHub’da tahrirlab **Commit** qiling — 1–2 daqiqada sayt yangilanadi.
`firestore.rules` ni o‘zgartirsangiz, uni Firebase konsoli → Firestore Database → Rules ga ham qo‘yib **Publish** qiling.

## Birinchi kirish

1. Saytni oching → **Ro‘yxatdan o‘tish**. **Birinchi ro‘yxatdan o‘tgan hisob — Super admin**, shuning uchun birinchi bo‘lib o‘zingiz kiring.
2. **Xodimlar → Ma’lumotlarni ko‘chirish** → `data/claude-export.json` → Katalog, Mijozlar, Agentlar, Mashinalar → **Ko‘chirish**.
3. **Hisobotlar → Yuk xati sozlamalari**: imzolovchilar va “Keyingi yuk xati №”.

## EVEREST: EVEREST BASALT bilan ulanish

- **Katalog bitta**: Firestore `catalog` — ikkala platforma shu katalogdan foydalanadi. Mahsulot qo‘shish/tahrirlash shu yerda (**Katalog** bo‘limi), EVEREST BASALT uni o‘qiydi.
- **Standart katalog**: `docs/catalog.json` (138 mahsulot; EVEREST papkasidagi `shared/catalog.json` bilan bir xil). Katalog bo‘sh bo‘lsa — **Katalog → Standart katalogni yuklash** (faqat yo‘q mahsulotlarni qo‘shadi).
- **«Barchasi»**: Qabul (qo‘lda qabul) va Yorliq kiritish bo‘limlarida butun mahsulot ro‘yxatini ochadi — qidiruv, PLITA / LAMEL / QADOQ bo‘yicha saralash, bosib tanlash.
- **Yangi yorliqlar EVEREST BASALT’da** (Mahsulot rejasi → Yorliq chop etish) chop etiladi — o‘sha `lots/_labelseq` hisoblagichi, o‘sha yorliq shakli. Qadoqlar bu yerda “Qabul kutilmoqda” bo‘lib chiqadi, chop etgan xodim “… (EVEREST BASALT)” deb ko‘rinadi.
- Bu ilovaning **Yorliq chop etish** bo‘limida faqat **qayta chop etish** qoldi. Super admin favqulodda holatda «Eski shaklni ochish» tugmasi bilan eski shaklni ochishi mumkin.

## Yorliq chop etish — eski shakl va qayta chop etish (Gainscha GS-3405T, 100 × 70 mm)

**Yorliq chop etish** bo‘limi: katalog jadvalidan mahsulotga yorliq sonini yozing, sana va smenani tanlang → **Ro‘yxatga olish va chop etish**. Har bir qadoqqa raqam beriladi (`YYMMDD` + kunlik tartib raqami, masalan `2610190001`), qadoq “Qabul kutilmoqda” holatida tizimga yoziladi, yorliqlar printerga chiqadi. Ombor yorliq QR’ini skanerlab qabul qiladi. Hisoblagich: Firestore `lots/_labelseq`.
Printer sozlamasi ilovaning o‘zida («Printerni sozlash» bo‘limi): drayverda 100×70 mm qog‘oz, Chrome’da Chetlar — Yo‘q, Masshtab — 100%.

## Rollar

| Rol | Kim beradi | Nima qila oladi |
|---|---|---|
| Super admin | — (birinchi hisob) | hammasi, Boshqaruv tayinlaydi, bloklaydi, o‘chiradi, ko‘chirish |
| Boshqaruv | Super admin | xodimlarni tasdiqlaydi, katalog, sozlamalar, o‘chirish |
| Menejer / Omborchi / Ishlab chiqarish | Boshqaruv | qabul, chiqim, yorliq, mijoz qo‘shish |
| Kuzatuvchi | Boshqaruv | faqat ko‘rish |
| Tasdiqlanmagan | — | hech narsa ko‘rmaydi, faqat “kutilmoqda” oynasi |

Parol unutilsa: Firebase konsoli → Authentication → Users → hisobni o‘chiring, xodim qayta ro‘yxatdan o‘tadi, rolini yana bering.

## Bepul tarif (Spark)

Firestore: kuniga 50 000 o‘qish, 20 000 yozish. Ilova har ochilganda ~1 200 o‘qiydi (katalog, mijozlar, mashinalar, so‘nggi chiqimlar) — kuniga ~40 marta ochish bepul. Ko‘proq bo‘lsa, loyihani **Blaze** tarifiga o‘tkazing (100 000 o‘qish ≈ 0,06 $) va Budget alert qo‘ying.
