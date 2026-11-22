# 🛹 MAPA 04 — Todos os Personagens (`g_SkaterTable`), Modelos, Stats e Decks

- **Endereço Base em RAM:** `0x800B6834` (`SLUS_010.66 +0x0A7034`)
- **Tamanho por Entrada:** `0x154` (340 bytes) | **Total:** 20 skatistas (`0..19`)
- **Rotinas que leem esta tabela:** `0x800102FC`, `0x80011134`, `0x80011178`, `0x8002223C`, `0x800257B0`, `0x80026650`, `0x80026B1C`

---

## 1. Layout Exato da Struct `SkaterEntry` (`0x154` bytes)

| Offset Relativo | Tamanho | Campo | Descrição |
| :---: | :---: | :--- | :--- |
| `+0x000` | 4 B | `const char *model_a` | Modelo 3D Roupa A (ex.: `hawk2` → `hawk2.psx` + `hawk2.psh`) |
| `+0x004` | 4 B | `const char *model_a_low` | Modelo 3D LOD baixo Roupa A (`hawk2_L`) |
| `+0x008` | 4 B | `const char *model_b` | Modelo 3D Roupa B (`hawk2b`) |
| `+0x00C` | 4 B | `const char *model_b_low` | Modelo 3D LOD baixo Roupa B (`hawk2b_L`) |
| `+0x010` / `+0x014` | 8 B | `model_secret` / `_low` | Modelo secreto/alternativo (ex.: `secret4` para 80's Tony) |
| `+0x020` | 4 B | `const char *full_name` | Nome completo exibido nos menus |
| `+0x024` | 4 B | `const char *short_name` | Nome curto |
| `+0x028` – `+0x127` | 256 B | `DeckEntry decks[8]` | 8 decks × 32 bytes (`bmp_name`, `deck_name`, `flags`, 3 bônus de atributos) |
| `+0x128` – `+0x131` | 10 B | `uint8_t stats[10]` | `[Air, Hang, Ollie, Speed, Spin, Land, Switch, Rail, Lip, Manual]` (1..10) |
| `+0x132` | 1 B | `uint8_t stance` | `0 = Regular`, `1 = Goofy` |
| `+0x134` | 4 B | `const char *face_bmp` | Textura de rosto no menu (ex.: `s2face5.bmp` em `CD.WAD`) |
| `+0x138` | 4 B | `const char **bio_lines` | Ponteiro para array de linhas da biografia |
| `+0x140` | 4 B | `uint32_t scale_or_id` | Escala/peso/ID interno |
| `+0x150` | 4 B | `void *special_tricks` | Ponteiro para lista de manobras especiais padrão |

---

## 2. Tabela Completa de Todos os 20 Skatistas

| Idx | RAM | Offset `SLUS` | Nome Atual | Modelo A / B | Rosto (`.BMP`) | Offset Stats (`SLUS`) | Stats `[Air,Hng,Oll,Spd,Spn,Lnd,Swt,Rl,Lip,Man]` | Vídeo Final |
| :-: | :---: | :---: | :--- | :--- | :--- | :---: | :--- | :--- |
| 0 | `0x800B6834` | `0x0A7034` | **Tony Hawk** | `hawk2` / `hawk2b` | `s2face5.bmp` | `0x0A715C` | `[7,5,2,6,8,5,3,3,6,5]` | `X\HAWK.STR` |
| 1 | `0x800B6988` | `0x0A7188` | **Bob Burnquist** | `burnq2` / `burnq2b` | `s2face1.bmp` | `0x0A72B0` | `[6,5,5,5,5,3,8,2,7,4]` | `X\BURNQUIS.STR` |
| 2 | `0x800B6ADC` | `0x0A72DC` | **Steve Caballero** | `cab` / `cab2b` | `s2face2.bmp` | `0x0A7404` | `[6,5,5,6,3,5,5,6,5,4]` | `X\CABALLER.STR` |
| 3 | `0x800B6C30` | `0x0A7430` | **Kareem Campbell** | `campb2` / `campb2b` | `s2face3.bmp` | `0x0A7558` | `[7,2,6,5,8,4,5,6,2,5]` | `X\CAMPBELL.STR` |
| 4 | `0x800B6D84` | `0x0A7584` | **Wagner Oliver** | `glif2` / `glif2b` | `s2face4.bmp` | `0x0A76AC` | `[7,7,5,6,5,3,4,4,6,3]` | `X\GLIFBERG.STR` |
| 5 | `0x800B6ED8` | `0x0A76D8` | **Eric Koston** | `koston` / `koston2b` | `s2face6.bmp` | `0x0A7800` | `[4,3,7,5,4,4,7,7,3,6]` | `X\KOSTON.STR` |
| 6 | `0x800B702C` | `0x0A782C` | **Bucky Lasek** | `lasek2` / `lasek2b` | `s2face7.bmp` | `0x0A7954` | `[7,7,3,6,7,3,5,3,7,2]` | `X\LASEK.STR` |
| 7 | `0x800B7180` | `0x0A7980` | **Francis Paulo** | `mullen` / `mullen2b` | `s2face9.bmp` | `0x0A7AA8` | `[2,2,6,5,8,2,8,7,2,8]` | `X\MULLEN.STR` |
| 8 | `0x800B72D4` | `0x0A7AD4` | **Borsato   ** | `muska2` / `muska2b` | `s2face8.bmp` | `0x0A7BFC` | `[4,3,8,6,4,7,5,8,3,2]` | `X\MUSKA.STR` |
| 9 | `0x800B7428` | `0x0A7C28` | **Andrew Reynolds** | `rynld2` / `rynld2b` | `s2face10.bmp` | `0x0A7D50` | `[4,2,8,4,5,7,5,8,4,3]` | `X\REYNOLDS.STR` |
| 10 | `0x800B757C` | `0x0A7D7C` | **Natan Oliver** | `rowley2` / `rowley2b` | `s2face11.bmp` | `0x0A7EA4` | `[6,2,6,4,5,5,4,8,7,3]` | `X\ROWLEY.STR` |
| 11 | `0x800B76D0` | `0x0A7ED0` | **Elissa Steamer** | `steam2` / `steam2b` | `s2face12.bmp` | `0x0A7FF8` | `[6,4,5,5,5,4,5,6,5,5]` | `X\STEAMER.STR` |
| 12 | `0x800B7824` | `0x0A8024` | **Joao Paulo  ** | `thomas2` / `thomas2b` | `s2face13.bmp` | `0x0A814C` | `[4,3,7,6,4,8,4,7,4,3]` | `X\THOMAS.STR` |
| 13 | `0x800B7978` | `0x0A8178` | **Custom Skater 1** | `error` / `error` | `s2face0.bmp` | `0x0A82A0` | `[5,4,5,5,4,4,4,5,4,5]` | `X\BAILS01.STR` |
| 14 | `0x800B7ACC` | `0x0A82CC` | **Custom Skater 2** | `error` / `error` | `s2face0.bmp` | `0x0A83F4` | `[5,4,5,5,4,4,4,5,4,5]` | `X\BAILS01.STR` |
| 15 | `0x800B7C20` | `0x0A8420` | **Custom Skater 3** | `error` / `error` | `s2face0.bmp` | `0x0A8548` | `[5,4,5,5,4,4,4,5,4,5]` | `X\BAILS01.STR` |
| 16 | `0x800B7D74` | `0x0A8574` | **Custom Skater 4** | `error` / `error` | `s2face0.bmp` | `0x0A869C` | `[5,4,5,5,4,4,4,5,4,5]` | `X\BAILS01.STR` |
| 17 | `0x800B7EC8` | `0x0A86C8` | **Gordao      ** | `secret1` / `secret1b` | `s2face15.bmp` | `0x0A87F0` | `[6,6,5,7,5,4,5,4,4,4]` | `X\OD.STR` |
| 18 | `0x800B801C` | `0x0A881C` | **Private Carrera** | `secret2` / `secret2b` | `s2face18.bmp` | `0x0A8944` | `[5,5,4,5,4,4,4,6,6,7]` | `X\PC.STR` |
| 19 | `0x800B8170` | `0x0A8970` | **Spider-Man** | `secret3` / `secret3b` | `s2face16.bmp` | `0x0A8A98` | `[7,7,5,5,5,4,4,6,3,4]` | `X\SM.STR` |

---

## 3. Decks, Biografias e Ponteiros de Especiais por Personagem

- **[0] Tony Hawk** (Bio `0x800B9D80` | Specials `0x800B62E0`): `s2dBi01a.bmp` (Full Skull 99) • `s2dBi02a.bmp` (Falcon3) • `s2dBi03a.bmp` (Falcon 2) • `s2dBi04a.bmp` (Pterodactyl) • `s2dBi05a.bmp` (Birdman Head) • `s2dBi06a.bmp` (Falcon) • `s2dBi07a.bmp` (Hawk) • `s2dBi08a.bmp` (Birdman)
- **[1] Bob Burnquist** (Bio `0x800B9DAC` | Specials `0x800B63CC`): `s2dFi01b.bmp` (Stamp) • `s2dFi02b.bmp` (Stencil Enforcer) • `s2dFi03b.bmp` (Shadow) • `s2dFi04b.bmp` (Cigar) • `s2dFi05b.bmp` (Can't Stop) • `s2dFi06b.bmp` (Maestro) • `s2dFi07b.bmp` (Can't Stop Bob) • `s2dFi08b.bmp` (Football)
- **[2] Steve Caballero** (Bio `0x800B9DEC` | Specials `0x800B6680`): `s2dPo01c.bmp` (Original Dragon '80) • `s2dPo02c.bmp` (Chinese '86) • `s2dPo03c.bmp` (Bats '87) • `s2dPo04c.bmp` (Animal Chin '88) • `s2dPo05c.bmp` (Mask '89) • `s2dPo06c.bmp` (Guitar '90) • `s2dPo07c.bmp` (Gundam '95) • `s2dPo08c.bmp` (Brigade '00)
- **[3] Kareem Campbell** (Bio `0x800B9E30` | Specials `0x800B6594`): `s2dCi01d.bmp` (CityStars.com) • `s2dCi02d.bmp` (Dwella) • `s2dCi03d.bmp` (Splash) • `s2dCi04d.bmp` (Silhoette) • `s2dCi05d.bmp` (Needle to the Record) • `s2dCi06d.bmp` (Rapper) • `s2dCi07d.bmp` (Performance) • `s2dCi08d.bmp` (Biker)
- **[4] Wagner Oliver** (Bio `0x800B9E74` | Specials `0x800B662C`): `s2dFl01e.bmp` (New Wave) • `s2dFl02e.bmp` (Smiley Face) • `s2dFl03e.bmp` (Multi) • `s2dFl04e.bmp` (Mother Earth) • `s2dFl07e.bmp` (Euro-Flair) • `s2dFl06e.bmp` (King of Copenhagen) • `s2dFl05e.bmp` (Dragon) • `s2dFl08e.bmp` (Red Elephant)
- **[5] Eric Koston** (Bio `0x800B9EB4` | Specials `0x800B64FC`): `s2dGi01f.bmp` (Old Man) • `s2dGi02f.bmp` (Flag Series) • `s2dGi03f.bmp` (Dog) • `s2dGi04f.bmp` (Baseball) • `s2dGi05f.bmp` (Luche Libre) • `s2dGi06f.bmp` (Basketball) • `s2dGi07f.bmp` (Boombox) • `s2dGi08f.bmp` (OG 2000)
- **[6] Bucky Lasek** (Bio `0x800B9EEC` | Specials `0x800B6430`): `s2dBi01g.bmp` (Flame Bird) • `s2dBi02g.bmp` (Giant B) • `s2dBi03g.bmp` (Eatin' Bird) • `s2dBi04g.bmp` (The End) • `s2dBi05g.bmp` (Bird) • `s2dBi06g.bmp` (Bucky and the Bird) • `s2dBi07g.bmp` (Cat Killer) • `s2dBi08g.bmp` (Bucky 1)
- **[7] Francis Paulo** (Bio `0x800B9F28` | Specials `0x800B65D8`): `s2dAt01h.bmp` (Scope) • `s2dAt02h.bmp` (3D Bunny) • `s2dAt03h.bmp` (Bunny Crest) • `s2dAt04h.bmp` (3D Bar Logo) • `s2dAt05h.bmp` (I.D. Series) • `s2dAt06h.bmp` (Stealth) • `s2dAt08h.bmp` (Bar Logo) • `s2dAt07h.bmp` (Hunny Bunny)
- **[8] Borsato   ** (Bio `0x800B9F6C` | Specials `0x800B6474`): `s2dSh01i.bmp` (Kamakazi Large) • `s2dSh08i.bmp` (Team XXL) • `s2dSh06i.bmp` (Team Large) • `s2dSh03i.bmp` (Kamakazi XL) • `s2dSh05i.bmp` (Large Red) • `s2dSh04i.bmp` (Team Small) • `s2dSh07i.bmp` (Team XL) • `s2dSh02i.bmp` (Kamakazi Medium)
- **[9] Andrew Reynolds** (Bio `0x800B9FB0` | Specials `0x800B6388`): `s2dBi01j.bmp` (Executioner) • `s2dBi02j.bmp` (Kosickutioner) • `s2dBi03j.bmp` (Monkey) • `s2dBi04j.bmp` (Razor) • `s2dBi05j.bmp` (Reaper) • `s2dBi07j.bmp` (Mummy) • `s2dBi08j.bmp` (Toy Logo) • `s2dBi06j.bmp` (Reaper 3)
- **[10] Natan Oliver** (Bio `0x800B9FF0` | Specials `0x800B6540`): `s2dFl01k.bmp` (Pop Cat) • `s2dFl02k.bmp` (Smiley Face) • `s2dFl08k.bmp` (Direction) • `s2dFl04k.bmp` (Death Metal) • `s2dFl05k.bmp` (Modern) • `s2dFl06k.bmp` (Guilty As Charged) • `s2dFl07k.bmp` (New Wave) • `s2dFl03k.bmp` (Red Death)
- **[11] Elissa Steamer** (Bio `0x800BA02C` | Specials `0x800B64B8`): `s2dTo01l.bmp` (Mon-Star) • `s2dTo02l.bmp` (Blood Stains) • `s2dTo03l.bmp` (Cry Wolf) • `s2dTo04l.bmp` (Poo Poo Head) • `s2dTo05l.bmp` (Pushing Up) • `s2dTo06l.bmp` (Tenth Try) • `s2dTo07l.bmp` (Dead Monster) • `s2dTo08l.bmp` (Skull)
- **[12] Joao Paulo  ** (Bio `0x800BA068` | Specials `0x800B6324`): `s2dZe01m.bmp` (Power) • `s2dZe02m.bmp` (Wolves) • `s2dZe03m.bmp` (Overspray) • `s2dZe04m.bmp` (Red Bold) • `s2dZe05m.bmp` (Eagle) • `s2dZe06m.bmp` (Smith Grind) • `s2dZe07m.bmp` (American Zero) • `s2dZe08m.bmp` (American Punk)
- **[17] Gordao      ** (Bio `0x800BA0C0` | Specials `0x800B66C4`): `s2dDi01t.bmp` (Breakfast of Champions) • `s2dDi02t.bmp` (Sweetheart) • `s2dDi03t.bmp` (The Other Night Stick) • `s2dDi04t.bmp` (Dick's Wieners) • `s2dDi05t.bmp` (Search Warrant) • `s2dDi06t.bmp` (D.O.A.) • `s2dDi07t.bmp` (Code Red) • `s2dDi08t.bmp` (Chester)
- **[18] Private Carrera** (Bio `0x800BA0F4` | Specials `0x800B6708`): `s2dpv01v.bmp` (Stiff Competition) • `s2dpv02v.bmp` (JoyStick) • `s2dpv03v.bmp` (I Balled) • `s2dpv04v.bmp` (Hard At Work) • `s2dpv05v.bmp` (On top of it) • `s2dpv06v.bmp` (Brass) • `s2dpv07v.bmp` (Slippery when Wet) • `s2dpv08v.bmp` (2 on 1)
- **[19] Spider-Man** (Bio `0x800BA130` | Specials `0x800B674C`): `s2dSP01s.bmp` (38 Years of Spidey) • `s2dSP02s.bmp` (Black Cat) • `s2dSP03s.bmp` (Rhino's Rampage) • `s2dSP04s.bmp` (Web Head) • `s2dSP05s.bmp` (Symbiotes) • `s2dSP06s.bmp` (Mary Jane) • `s2dSP07s.bmp` (Enter Venom) • `s2dSP08s.bmp` (Spidey Sense Tingling)
