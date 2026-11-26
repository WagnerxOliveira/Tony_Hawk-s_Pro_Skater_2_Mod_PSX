# 🤸 MAPA 05 — Todas as Manobras (`tricks.bin`)

- **Localização no `CD.HED`:** Índice `11` | Hash `0x9D9973E7` (`nsHash("tricks.bin")`)
- **Localização no `CD.WAD`:** Offset `0x0014E000` | Tamanho `33592` bytes
- **Carregamento em `SLUS_010.66`:** String `"tricks.bin"` em `0x800D2848`, carregada em `0x80014130`

---

## 1. Formato do Bytecode de Manobras

Dentro de `tricks.bin`, as definições de manobra seguem o padrão de bytecode da engine Neversoft:
```text
[0x0B] [Nome ASCII da Manobra] [0x00] [0x0A] [uint16_le Pontuação Base] ...
```
- Nomes entre chaves `{...}` indicam **Special Tricks** (manobras especiais douradas, ex.: `{The 900}`, `{Heelflip Darkslide}`, `{Spidey Grind}`).
- Para alterar a pontuação de qualquer manobra, basta editar os **2 bytes (`uint16_le`)** no offset de pontuação indicado abaixo e reempacotar `CD.WAD` com `node tools/thps2_wad.js repack`.

---

## 2. Catálogo Completo de Manobras Extraídas (`202` entradas)

| # | Offset em `tricks.bin` | Offset Absoluto `CD.WAD` | Nome da Manobra | Tipo | Offset Pontos (`tricks.bin`) | Pontos Base |
| :-: | :---: | :---: | :--- | :---: | :---: | :---: |
| 1 | `+0x0020` | `0x0014E020` | `MICKMANUAL` | Normal | `+0x002C` | **100** |
| 2 | `+0x0036` | `0x0014E036` | `MickTrick` | Normal | — | ***(variável/combo)*** |
| 3 | `+0x0044` | `0x0014E044` | `ForwardTrick` | Normal | — | ***(variável/combo)*** |
| 4 | `+0x0059` | `0x0014E059` | `Mick Air trick` | Normal | — | ***(variável/combo)*** |
| 5 | `+0x006F` | `0x0014E06F` | `NollieMick` | Normal | — | ***(variável/combo)*** |
| 6 | `+0x2FA4` | `0x00150FA4` | `{Ho Ho Handplant}` | ⭐ Special | `+0x2FB7` | **2000** |
| 7 | `+0x3001` | `0x00151001` | `One Foot Invert` | Normal | `+0x3012` | **1500** |
| 8 | `+0x305C` | `0x0015105C` | `Mute Invert` | Normal | `+0x3069` | **1000** |
| 9 | `+0x30BC` | `0x001510BC` | `BS Disaster` | Normal | `+0x30C9` | **800** |
| 10 | `+0x311E` | `0x0015111E` | `Nosestall` | Normal | `+0x3129` | **750** |
| 11 | `+0x3191` | `0x00151191` | `FS Nosepick` | Normal | `+0x319E` | **900** |
| 12 | `+0x31FC` | `0x001511FC` | `Rock n Roll` | Normal | `+0x3209` | **500** |
| 13 | `+0x3268` | `0x00151268` | `Handplant` | Normal | `+0x3273` | **750** |
| 14 | `+0x32BB` | `0x001512BB` | `Eggplant` | Normal | `+0x32C5` | **900** |
| 15 | `+0x330E` | `0x0015130E` | `BS Axle Stall` | Normal | `+0x331D` | **500** |
| 16 | `+0x3379` | `0x00151379` | `Gymnast Plant` | Normal | `+0x3388` | **1500** |
| 17 | `+0x33D8` | `0x001513D8` | `180 BS Rock n Roll` | Normal | — | ***(variável/combo)*** |
| 18 | `+0x35E9` | `0x001515E9` | `Kissed the Rail` | Normal | `+0x35FA` | **100** |
| 19 | `+0x3604` | `0x00151604` | `Kissed the Rail` | Normal | `+0x3615` | **100** |
| 20 | `+0x362E` | `0x0015162E` | `{Heelflip Darkslide}` | ⭐ Special | `+0x3644` | **550** |
| 21 | `+0x36CA` | `0x001516CA` | `{One Foot Smith}` | ⭐ Special | `+0x36DC` | **400** |
| 22 | `+0x375D` | `0x0015175D` | `{FS One Foot Smith}` | ⭐ Special | `+0x3772` | **400** |
| 23 | `+0x37ED` | `0x001517ED` | `{Spidey Grind}` | ⭐ Special | `+0x37FD` | **600** |
| 24 | `+0x3888` | `0x00151888` | `{Fifty-5 Ho Slide}` | ⭐ Special | `+0x389C` | **600** |
| 25 | `+0x3921` | `0x00151921` | `{The Big Hitter}` | ⭐ Special | `+0x3933` | **500** |
| 26 | `+0x39BE` | `0x001519BE` | `{Layback Grind}` | ⭐ Special | `+0x39CF` | **600** |
| 27 | `+0x3A54` | `0x00151A54` | `{Nosegrab Tailslide}` | ⭐ Special | `+0x3A6A` | **500** |
| 28 | `+0x3AE3` | `0x00151AE3` | `{One Foot Bluntslide}` | ⭐ Special | `+0x3AFA` | **500** |
| 29 | `+0x3B76` | `0x00151B76` | `{Rowley Darkslide}` | ⭐ Special | `+0x3B8A` | **500** |
| 30 | `+0x3C06` | `0x00151C06` | `{Nosegrind to Pivot}` | ⭐ Special | `+0x3C1C` | **500** |
| 31 | `+0x3C9E` | `0x00151C9E` | `{Darkslide}` | ⭐ Special | `+0x3CAB` | **400** |
| 32 | `+0x3D33` | `0x00151D33` | `{BS Rocket Tailslide}` | ⭐ Special | `+0x3D4A` | **500** |
| 33 | `+0x3DD2` | `0x00151DD2` | `{FS Rocket Tailslide}` | ⭐ Special | `+0x3DE9` | **500** |
| 34 | `+0x3E68` | `0x00151E68` | `{Madonna Tailslide}` | ⭐ Special | `+0x3E7D` | **500** |
| 35 | `+0x3F12` | `0x00151F12` | `{Beni Fingerflip Crooks}` | ⭐ Special | `+0x3F2C` | **500** |
| 36 | `+0x3FB6` | `0x00151FB6` | `{Hang Ten}` | ⭐ Special | `+0x3FC2` | **500** |
| 37 | `+0x404F` | `0x0015204F` | `{The Fandangle}` | ⭐ Special | `+0x4060` | **500** |
| 38 | `+0x40E7` | `0x001520E7` | `BS Noseslide` | Normal | `+0x40F5` | **150** |
| 39 | `+0x4175` | `0x00152175` | `FS Noseslide` | Normal | `+0x4183` | **150** |
| 40 | `+0x4201` | `0x00152201` | `BS Tailslide` | Normal | `+0x420F` | **150** |
| 41 | `+0x4287` | `0x00152287` | `FS Tailslide` | Normal | `+0x4295` | **150** |
| 42 | `+0x4308` | `0x00152308` | `BS Boardslide` | Normal | `+0x4317` | **200** |
| 43 | `+0x4392` | `0x00152392` | `FS Boardslide` | Normal | `+0x43A1` | **200** |
| 44 | `+0x441C` | `0x0015241C` | `BS Lipslide` | Normal | `+0x4429` | **200** |
| 45 | `+0x44A4` | `0x001524A4` | `FS Lipslide` | Normal | `+0x44B1` | **200** |
| 46 | `+0x452F` | `0x0015252F` | `BS Crooked` | Normal | `+0x453B` | **125** |
| 47 | `+0x45B8` | `0x001525B8` | `FS Crooked` | Normal | `+0x45C4` | **125** |
| 48 | `+0x4641` | `0x00152641` | `BS Overcrook` | Normal | `+0x464F` | **125** |
| 49 | `+0x46CC` | `0x001526CC` | `FS Overcrook` | Normal | `+0x46DA` | **125** |
| 50 | `+0x4757` | `0x00152757` | `BS Smith` | Normal | `+0x4761` | **125** |
| 51 | `+0x47D6` | `0x001527D6` | `FS Smith` | Normal | `+0x47E0` | **125** |
| 52 | `+0x4855` | `0x00152855` | `BS Feeble` | Normal | `+0x4860` | **125** |
| 53 | `+0x48D5` | `0x001528D5` | `FS Feeble` | Normal | `+0x48E0` | **125** |
| 54 | `+0x49D8` | `0x001529D8` | `BS Bluntslide` | Normal | `+0x49E7` | **250** |
| 55 | `+0x4A61` | `0x00152A61` | `FS Bluntslide` | Normal | `+0x4A70` | **250** |
| 56 | `+0x4B2B` | `0x00152B2B` | `FS Nosebluntslide` | Normal | `+0x4B3E` | **250** |
| 57 | `+0x4BC0` | `0x00152BC0` | `BS Nosebluntslide` | Normal | `+0x4BD3` | **250** |
| 58 | `+0x4C50` | `0x00152C50` | `FS 5-0` | Normal | `+0x4C58` | **100** |
| 59 | `+0x4C9F` | `0x00152C9F` | `Kissed the Rail` | Normal | `+0x4CB0` | **25** |
| 60 | `+0x4CD0` | `0x00152CD0` | `Kissed the Rail` | Normal | `+0x4CE1` | **100** |
| 61 | `+0x4CED` | `0x00152CED` | `BS 5-0` | Normal | `+0x4CF5` | **100** |
| 62 | `+0x4D3C` | `0x00152D3C` | `Kissed the Rail` | Normal | `+0x4D4D` | **25** |
| 63 | `+0x4D6D` | `0x00152D6D` | `Kissed the Rail` | Normal | `+0x4D7E` | **100** |
| 64 | `+0x4D8A` | `0x00152D8A` | `FS NoseGrind` | Normal | `+0x4D98` | **100** |
| 65 | `+0x4DDF` | `0x00152DDF` | `Kissed the Rail` | Normal | `+0x4DF0` | **25** |
| 66 | `+0x4E12` | `0x00152E12` | `Kissed the Rail` | Normal | `+0x4E23` | **100** |
| 67 | `+0x4E31` | `0x00152E31` | `BS NoseGrind` | Normal | `+0x4E3F` | **100** |
| 68 | `+0x4E86` | `0x00152E86` | `Kissed the Rail` | Normal | `+0x4E97` | **25** |
| 69 | `+0x4EB9` | `0x00152EB9` | `Kissed the Rail` | Normal | `+0x4ECA` | **100** |
| 70 | `+0x4ED8` | `0x00152ED8` | `FS 50-50` | Normal | `+0x4EE2` | **75** |
| 71 | `+0x4F27` | `0x00152F27` | `Kissed the Rail` | Normal | `+0x4F38` | **25** |
| 72 | `+0x4F58` | `0x00152F58` | `Kissed the Rail` | Normal | `+0x4F69` | **100** |
| 73 | `+0x4F75` | `0x00152F75` | `BS 50-50` | Normal | `+0x4F7F` | **75** |
| 74 | `+0x4FC4` | `0x00152FC4` | `Kissed the Rail` | Normal | `+0x4FD5` | **25** |
| 75 | `+0x4FF5` | `0x00152FF5` | `Kissed the Rail` | Normal | `+0x5006` | **100** |
| 76 | `+0x5013` | `0x00153013` | `FS 50-50` | Normal | `+0x501D` | **75** |
| 77 | `+0x5058` | `0x00153058` | `Kissed the Rail` | Normal | `+0x5069` | **25** |
| 78 | `+0x5087` | `0x00153087` | `BS 50-50` | Normal | `+0x5091` | **75** |
| 79 | `+0x50CC` | `0x001530CC` | `Kissed the Rail` | Normal | `+0x50DD` | **25** |
| 80 | `+0x50FD` | `0x001530FD` | `Fakie Nosegrind` | Normal | — | ***(variável/combo)*** |
| 81 | `+0x5111` | `0x00153111` | `Nosegrind` | Normal | `+0x511C` | **100** |
| 82 | `+0x514A` | `0x0015314A` | `Fakie 5-0` | Normal | — | ***(variável/combo)*** |
| 83 | `+0x5158` | `0x00153158` | `5-0` | Normal | `+0x515D` | **100** |
| 84 | `+0x51A5` | `0x001531A5` | `{Does Whatever a Spider Can}` | ⭐ Special | `+0x51C3` | **3500** |
| 85 | `+0x51F7` | `0x001531F7` | `{Laser Flip}` | ⭐ Special | `+0x5205` | **1500** |
| 86 | `+0x5233` | `0x00153233` | `{Nollieflip Underflip}` | ⭐ Special | `+0x524B` | **1500** |
| 87 | `+0x5279` | `0x00153279` | `{Triple Heelflip}` | ⭐ Special | `+0x528C` | **1500** |
| 88 | `+0x52BA` | `0x001532BA` | `{Pizza Guy}` | ⭐ Special | `+0x52C7` | **1750** |
| 89 | `+0x52EB` | `0x001532EB` | `{Ghetto Bird}` | ⭐ Special | `+0x52FA` | **1750** |
| 90 | `+0x531F` | `0x0015331F` | `{Hardflip Late Flip}` | ⭐ Special | `+0x5335` | **1500** |
| 91 | `+0x5363` | `0x00153363` | `{Double Hardflip}` | ⭐ Special | `+0x5376` | **1500** |
| 92 | `+0x53A4` | `0x001533A4` | `{Triple Kickflip}` | ⭐ Special | `+0x53B7` | **1250** |
| 93 | `+0x53D8` | `0x001533D8` | `{540 Flip}` | ⭐ Special | `+0x53E4` | **1250** |
| 94 | `+0x5405` | `0x00153405` | `{Shove It Rewind}` | ⭐ Special | `+0x5418` | **1250** |
| 95 | `+0x543C` | `0x0015343C` | `Kickflip` | Normal | `+0x5446` | **100** |
| 96 | `+0x5474` | `0x00153474` | `HeelFlip` | Normal | `+0x547E` | **100** |
| 97 | `+0x54AC` | `0x001534AC` | `Impossible` | Normal | `+0x54B8` | **250** |
| 98 | `+0x54E6` | `0x001534E6` | `Pop Shove It` | Normal | `+0x54F4` | **100** |
| 99 | `+0x551C` | `0x0015351C` | `FS Shove It` | Normal | `+0x5529` | **100** |
| 100 | `+0x5551` | `0x00153551` | `360 Shove It` | Normal | `+0x555F` | **250** |
| 101 | `+0x558A` | `0x0015358A` | `Body Varial` | Normal | `+0x5597` | **500** |
| 102 | `+0x55BF` | `0x001535BF` | `Hardflip` | Normal | `+0x55C9` | **300** |
| 103 | `+0x55F7` | `0x001535F7` | `360 Flip` | Normal | `+0x5601` | **500** |
| 104 | `+0x562F` | `0x0015362F` | `Varial Kickflip` | Normal | `+0x5640` | **300** |
| 105 | `+0x5671` | `0x00153671` | `Varial Heelflip` | Normal | `+0x5682` | **300** |
| 106 | `+0x56AD` | `0x001536AD` | `Inward Heelflip` | Normal | `+0x56BE` | **350** |
| 107 | `+0x56E6` | `0x001536E6` | `Varial` | Normal | `+0x56EE` | **900** |
| 108 | `+0x570C` | `0x0015370C` | `Sal Flip` | Normal | `+0x5716` | **900** |
| 109 | `+0x5749` | `0x00153749` | `Front Foot Impossible` | Normal | `+0x5760` | **700** |
| 110 | `+0x5785` | `0x00153785` | `KICKFLIP` | Normal | `+0x578F` | **200** |
| 111 | `+0x57B9` | `0x001537B9` | `HEELFLIP` | Normal | `+0x57C3` | **200** |
| 112 | `+0x57ED` | `0x001537ED` | `IMPOSSIBLE` | Normal | `+0x57F9` | **300** |
| 113 | `+0x5823` | `0x00153823` | `POP SHOVE IT` | Normal | `+0x5831` | **200** |
| 114 | `+0x585B` | `0x0015385B` | `FS SHOVE IT` | Normal | `+0x5868` | **200** |
| 115 | `+0x5892` | `0x00153892` | `360 SHOVE IT` | Normal | `+0x58A0` | **750** |
| 116 | `+0x58CA` | `0x001538CA` | `360 FLIP` | Normal | `+0x58D4` | **600** |
| 117 | `+0x58FE` | `0x001538FE` | `HARDFLIP` | Normal | `+0x5908` | **600** |
| 118 | `+0x5932` | `0x00153932` | `VARIAL KICKFLIP` | Normal | `+0x5943` | **600** |
| 119 | `+0x596D` | `0x0015396D` | `VARIAL HEELFLIP` | Normal | `+0x597E` | **600** |
| 120 | `+0x59A8` | `0x001539A8` | `INWARD HEELFLIP` | Normal | `+0x59B9` | **600** |
| 121 | `+0x59E3` | `0x001539E3` | `Kickflip to Indy` | Normal | `+0x59F5` | **700** |
| 122 | `+0x5A24` | `0x00153A24` | `360 Flip to Mute` | Normal | `+0x5A36` | **800** |
| 123 | `+0x5A5A` | `0x00153A5A` | `{Judo Madonna}` | ⭐ Special | `+0x5A6A` | **1500** |
| 124 | `+0x5A8F` | `0x00153A8F` | `{Front-Back Kickflip}` | ⭐ Special | — | ***(variável/combo)*** |
| 125 | `+0x5AE5` | `0x00153AE5` | `{Assume The Position}` | ⭐ Special | `+0x5AFC` | **1500** |
| 126 | `+0x5B3E` | `0x00153B3E` | `Heelflip Varial Lien` | Normal | `+0x5B54` | **800** |
| 127 | `+0x5B87` | `0x00153B87` | `{Kickflip 1 Foot Tail}` | ⭐ Special | `+0x5B9F` | **1250** |
| 128 | `+0x5BD9` | `0x00153BD9` | `{Double Splits}` | ⭐ Special | — | ***(variável/combo)*** |
| 129 | `+0x5C25` | `0x00153C25` | `{Hospital Flip}` | ⭐ Special | — | ***(variável/combo)*** |
| 130 | `+0x5C71` | `0x00153C71` | `{Half Flip Casper}` | ⭐ Special | — | ***(variável/combo)*** |
| 131 | `+0x5CC7` | `0x00153CC7` | `Ollie north` | Normal | — | ***(variável/combo)*** |
| 132 | `+0x5D07` | `0x00153D07` | `Benihana` | Normal | `+0x5D11` | **300** |
| 133 | `+0x5D1E` | `0x00153D1E` | `Benihana` | Normal | `+0x5D28` | **400** |
| 134 | `+0x5D51` | `0x00153D51` | `Madonna` | Normal | `+0x5D5A` | **250** |
| 135 | `+0x5D76` | `0x00153D76` | `Madonna` | Normal | `+0x5D7F` | **500** |
| 136 | `+0x5DB0` | `0x00153DB0` | `Japan Air` | Normal | `+0x5DBB` | **175** |
| 137 | `+0x5DD7` | `0x00153DD7` | `Japan Air` | Normal | `+0x5DE2` | **350** |
| 138 | `+0x5E13` | `0x00153E13` | `Stalefish` | Normal | `+0x5E1E` | **175** |
| 139 | `+0x5E3A` | `0x00153E3A` | `Stalefish` | Normal | `+0x5E45` | **350** |
| 140 | `+0x5E76` | `0x00153E76` | `Indy` | Normal | `+0x5E7C` | **150** |
| 141 | `+0x5EA3` | `0x00153EA3` | `Indy` | Normal | `+0x5EA9` | **300** |
| 142 | `+0x5EDA` | `0x00153EDA` | `Tailgrab` | Normal | `+0x5EE4` | **150** |
| 143 | `+0x5F0B` | `0x00153F0B` | `Tailgrab` | Normal | `+0x5F15` | **300** |
| 144 | `+0x5F46` | `0x00153F46` | `Crossbone` | Normal | `+0x5F51` | **175** |
| 145 | `+0x5F78` | `0x00153F78` | `Crossbone` | Normal | `+0x5F83` | **350** |
| 146 | `+0x5FB4` | `0x00153FB4` | `Melon` | Normal | `+0x5FBB` | **150** |
| 147 | `+0x5FE2` | `0x00153FE2` | `Melon` | Normal | `+0x5FE9` | **300** |
| 148 | `+0x601A` | `0x0015401A` | `Mute` | Normal | `+0x6020` | **175** |
| 149 | `+0x6047` | `0x00154047` | `Mute` | Normal | `+0x604D` | **350** |
| 150 | `+0x607E` | `0x0015407E` | `Roastbeef` | Normal | `+0x6089` | **150** |
| 151 | `+0x60A5` | `0x001540A5` | `Roastbeef` | Normal | `+0x60B0` | **300** |
| 152 | `+0x60E1` | `0x001540E1` | `Nosegrab` | Normal | `+0x60EB` | **150** |
| 153 | `+0x6112` | `0x00154112` | `Nosegrab` | Normal | `+0x611C` | **300** |
| 154 | `+0x614D` | `0x0015414D` | `Indy Nosebone` | Normal | `+0x615C` | **150** |
| 155 | `+0x6183` | `0x00154183` | `Nosebone` | Normal | `+0x618D` | **300** |
| 156 | `+0x61BE` | `0x001541BE` | `Method` | Normal | `+0x61C6` | **250** |
| 157 | `+0x61ED` | `0x001541ED` | `Method` | Normal | `+0x61F5` | **500** |
| 158 | `+0x6226` | `0x00154226` | `Rocket Air` | Normal | `+0x6232` | **250** |
| 159 | `+0x624E` | `0x0015424E` | `Rocket Air` | Normal | `+0x625A` | **500** |
| 160 | `+0x628B` | `0x0015428B` | `Judo` | Normal | `+0x6291` | **300** |
| 161 | `+0x62B8` | `0x001542B8` | `Judo` | Normal | `+0x62BE` | **600** |
| 162 | `+0x62EF` | `0x001542EF` | `Airwalk` | Normal | `+0x62F8` | **250** |
| 163 | `+0x631F` | `0x0015431F` | `Airwalk` | Normal | `+0x6328` | **500** |
| 164 | `+0x6359` | `0x00154359` | `Indy Stiffy` | Normal | `+0x6366` | **250** |
| 165 | `+0x638D` | `0x0015438D` | `Stiffy` | Normal | `+0x6395` | **500** |
| 166 | `+0x63C9` | `0x001543C9` | `{One Foot Japan}` | ⭐ Special | `+0x63DB` | **1250** |
| 167 | `+0x6429` | `0x00154429` | `{Christ Air}` | ⭐ Special | `+0x6437` | **1000** |
| 168 | `+0x6470` | `0x00154470` | `{Pogo Air}` | ⭐ Special | `+0x647C` | **2000** |
| 169 | `+0x64C3` | `0x001544C3` | `{Salute!!!}` | ⭐ Special | `+0x64D0` | **2500** |
| 170 | `+0x651C` | `0x0015451C` | `{Sacktap}` | ⭐ Special | `+0x6527` | **1500** |
| 171 | `+0x659D` | `0x0015459D` | `{Racket Air}` | ⭐ Special | `+0x65AB` | **1500** |
| 172 | `+0x661A` | `0x0015461A` | `{Indy Frontflip}` | ⭐ Special | — | ***(variável/combo)*** |
| 173 | `+0x6663` | `0x00154663` | `{Indy BackFlip}` | ⭐ Special | — | ***(variável/combo)*** |
| 174 | `+0x66AB` | `0x001546AB` | `{BS Grab BackFlip}` | ⭐ Special | — | ***(variável/combo)*** |
| 175 | `+0x6700` | `0x00154700` | `{Kickflip McTwist}` | ⭐ Special | `+0x6714` | **3500** |
| 176 | `+0x672F` | `0x0015472F` | `{FS 540}` | ⭐ Special | `+0x6739` | **3500** |
| 177 | `+0x6753` | `0x00154753` | `{Fingerflip Airwalk}` | ⭐ Special | `+0x6769` | **1500** |
| 178 | `+0x6791` | `0x00154791` | `{McTwist}` | ⭐ Special | `+0x679C` | **5000** |
| 179 | `+0x67FE` | `0x001547FE` | `{McTwist}` | ⭐ Special | `+0x6809` | **5000** |
| 180 | `+0x6851` | `0x00154851` | `{Rodeo Flip}` | ⭐ Special | `+0x685F` | **5000** |
| 181 | `+0x68C1` | `0x001548C1` | `{Rodeo Flip}` | ⭐ Special | `+0x68CF` | **5000** |
| 182 | `+0x68FE` | `0x001548FE` | `Mick Street` | Normal | `+0x690B` | **5000** |
| 183 | `+0x6948` | `0x00154948` | `{Spidey Flip}` | ⭐ Special | `+0x6957` | **5000** |
| 184 | `+0x6986` | `0x00154986` | `{Mute Backflip}` | ⭐ Special | `+0x6997` | **4500** |
| 185 | `+0x69B1` | `0x001549B1` | `{Rocket Backflip}` | ⭐ Special | `+0x69C4` | **4000** |
| 186 | `+0x69DC` | `0x001549DC` | `{Backflip}` | ⭐ Special | `+0x69E8` | **4000** |
| 187 | `+0x6A13` | `0x00154A13` | `{The 900}` | ⭐ Special | `+0x6A1E` | **8000** |
| 188 | `+0x6A4F` | `0x00154A4F` | `{FS Hurricane}` | ⭐ Special | `+0x6A5F` | **500** |
| 189 | `+0x6A79` | `0x00154A79` | `{BS Hurricane}` | ⭐ Special | `+0x6A89` | **500** |
| 190 | `+0x6AD9` | `0x00154AD9` | `Kissed the Rail` | Normal | `+0x6AEA` | **25** |
| 191 | `+0x6B0D` | `0x00154B0D` | `{FS Overturn}` | ⭐ Special | `+0x6B1C` | **500** |
| 192 | `+0x6B3E` | `0x00154B3E` | `{BS Overturn}` | ⭐ Special | `+0x6B4D` | **500** |
| 193 | `+0x6BA5` | `0x00154BA5` | `Kissed the Rail` | Normal | `+0x6BB6` | **25** |
| 194 | `+0x74E0` | `0x001554E0` | `NOSE MANUAL` | Normal | `+0x74ED` | **100** |
| 195 | `+0x7548` | `0x00155548` | `MANUAL` | Normal | `+0x7550` | **100** |
| 196 | `+0x75D8` | `0x001555D8` | `{Muska Nose Manual}` | ⭐ Special | `+0x75ED` | **500** |
| 197 | `+0x7663` | `0x00155663` | `{One Foot Nose Manual}` | ⭐ Special | `+0x767B` | **500** |
| 198 | `+0x76E0` | `0x001556E0` | `{One Foot 5-0 Manual}` | ⭐ Special | `+0x76F7` | **500** |
| 199 | `+0x7764` | `0x00155764` | `{Casper}` | ⭐ Special | `+0x776E` | **500** |
| 200 | `+0x77F2` | `0x001557F2` | `{Casper to 360 Flip}` | ⭐ Special | `+0x7808` | **500** |
| 201 | `+0x7892` | `0x00155892` | `{Freestylin'}` | ⭐ Special | `+0x78A1` | **2500** |
| 202 | `+0x78DB` | `0x001558DB` | `{Lazy A. Grind}` | ⭐ Special | `+0x78EC` | **600** |
