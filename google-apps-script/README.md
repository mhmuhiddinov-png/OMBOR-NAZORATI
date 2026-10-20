# Mijozlar va Agentlar — Google Sheets ⇄ Ombor nazorati

Jadval: **Ombor — Mijozlar va Agentlar**
https://docs.google.com/spreadsheets/d/1cdoiVBYbKxVn_rGlYU9NPd9RNoKzEg4neOh28lHblsA/edit

| Varaq | Ichida |
|---|---|
| `Mijozlar` | Kod, Mijoz nomi, Agent, Bozor, Manzillar (`;` bilan), Telefon, Izoh, Holat · yashirin: ID, Hash |
| `Agentlar` | Agent (F.I.Sh.), Qisqa ism, Bozor, Telefon, Holat · yashirin: ID, Hash |
| `_sync` | yashirin, skript uchun (tegmang) |

## Qanday ishlaydi

* **Jadval → ilova:** qatorni o‘zgartirsangiz, darhol (va har 5 daqiqada) Ombor nazoratiga yoziladi.
* **Ilova → jadval:** Chiqimda yoki Mijozlar bo‘limida qo‘shilgan / o‘zgartirilgan mijoz 5 daqiqa ichida jadvalga tushadi («Holat»: *Ilovada qo‘shilgan*).
* **Qator o‘chirilsa:** ilovada mijoz **o‘chirilmaydi** — «jadvalda yo‘q» belgisi bilan saqlanadi, eski yuk xatlari va hisobotlar buzilmaydi. Qaytarish uchun nomini jadvalga qayta yozing.
* **Kesh:** ilova ma’lumotni Firestore’da saqlaydi va brauzerda keshlaydi — jadval yoki internet bo‘lmasa ham oxirgi ro‘yxat ishlaydi.
* Yashirin **ID** ustunini o‘zgartirmang: nom yoki kod o‘zgarsa ham mijoz shu ID bo‘yicha taniladi.

## Bir marta o‘rnatish (5 daqiqa)

1. Firebase konsoli → **ombor-nazorati-eaedc** → ⚙ → **Users and permissions**: jadval egasi bo‘lgan Google hisob (mh.muhiddinov@gmail.com) **Owner** bo‘lishi kerak. Loyihani shu hisob bilan ochgan bo‘lsangiz — hammasi tayyor.
2. Jadvalni oching → **Kengaytmalar → Apps Script**.
3. Chapdagi ⚙ **Loyiha sozlamalari** → ✅ «`appsscript.json` manifest faylini muharrirda ko‘rsatish».
4. **Muharrir**: `Code.gs` ichidagini o‘chirib, shu papkadagi `Code.gs` ni joylang. `appsscript.json` ni ham shu papkadagi bilan almashtiring. **Saqlash** (💾).
5. Jadval sahifasini yangilang → yuqorida **Ombor** menyusi chiqadi → **Avtomatik yangilashni yoqish**.
6. Google ruxsat so‘raydi → hisobni tanlang → «Google hasn’t verified this app» chiqsa **Advanced → Go to … (unsafe)** → **Allow**. (Bu sizning o‘zingizning skriptingiz.)
7. Birinchi sinxron 20–40 soniya. Tugagach pastda xabar chiqadi, ilovada **Mijozlar** bo‘limida «Google Sheets bilan bog‘langan · oxirgi yangilanish …» yozuvi paydo bo‘ladi.

Menyu: **Hozir sinxronlash** — kutmasdan; **To‘liq sinxronlash** — hammasini qayta tekshiradi; **Avtomatik yangilashni o‘chirish**.

## Xodimlarga ruxsat

Jadvalni tahrirlashi kerak bo‘lgan xodimlarga **Ulashish → Muharrir** bering. Ularning o‘zgarishlari ham avtomatik ketadi (skript sizning nomingizdan ishlaydi).

## Xato bo‘lsa

* *Firebase ruxsat bermadi (403)* — 1-qadamni tekshiring.
* Kunlik limitlar (bepul): Apps Script 90 daqiqa/kun, Firestore 50 000 o‘qish — bu sinxron kuniga ~1 000 dan kam o‘qish ishlatadi.
