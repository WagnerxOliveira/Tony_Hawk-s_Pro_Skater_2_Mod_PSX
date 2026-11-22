# Ghidra Python Script: Auto-label key THPS2 (SLUS_010.66) tables and functions
# Run via Ghidra -> Window -> Script Manager -> add tools/ directory -> run ghidra_apply_symbols.py
# @category PSX.THPS2
# @author Antigravity Reverse Engineering Toolkit

from ghidra.program.model.symbol import SourceType

SYMBOLS = [
    # Entry & Core File System
    (0x800A2910, "THPS2_EntryPoint", "PS-X EXE entry point (clears .bss 0x800D8674..0x800E2674)"),
    (0x80053F10, "Neversoft_HashFilename_CaseInsensitive", "CD.HED filename hash: tolower, init=0xFFFFFFFF, rol32(h,1), poly=0xEDB88320"),
    (0x80023130, "Neversoft_HashString_CaseSensitive", "Case-sensitive variant of Neversoft rol32+0xEDB88320 hash"),
    (0x80053F88, "CDWAD_OpenByFilename", "Hashes filename and opens entry from CD.HED/CD.WAD"),
    (0x800D71F4, "s_CD_HED_path", "\\CD.HED;1"),
    (0x800D7210, "s_CD_WAD_path", "\\CD.WAD;1"),
    (0x80014130, "Tricks_LoadTableRef", "References tricks.bin (0x800D2848)"),
    (0x800D2848, "s_tricks_bin", "tricks.bin"),
    (0x8003D3E8, "BMX_LaunchDemoRef", "Launches cdrom:\\BMX\\X.EXE;1"),
    (0x800B2064, "s_BMX_EXE_path", "cdrom:\\BMX\\X.EXE;1"),

    # Movie Player & Movie Table
    (0x800C1CB4, "g_MovieTable", "35 entries x 0x24 bytes (path, label, type, w, h, num_frames, fb_sz, ring, has_audio, unk, vol)"),
    (0x8007A6B8, "Movie_PlayerRef1", "References g_MovieTable"),
    (0x8007AD80, "Movie_PlayerRef2", "References g_MovieTable"),

    # Skater Roster Table
    (0x800B6834, "g_SkaterTable", "20 skaters x 0x154 bytes (model@+0x00, name@+0x20, 10-byte stats@+0x128)"),
    (0x800102FC, "Skater_Ref1", "References g_SkaterTable"),
    (0x800257B0, "Skater_Ref2", "References g_SkaterTable"),

    # Level Table
    (0x800B8444, "g_LevelTable", "11 levels x 0x174 bytes (Hangar .. Skate Heaven + Custom Park)"),
    (0x8001F9A0, "Level_Ref1", "References g_LevelTable"),
    (0x80024354, "Level_Ref2", "References g_LevelTable"),

    # Music / COMPILED.XA
    (0x800D6184, "s_COMPILED_XA_path", "\\COMPILED.XA;1"),
    (0x80038974, "XA_InitCompiledXA", "Opens \\COMPILED.XA;1"),
    (0x800BA4F4, "g_XATrackLengths", "Channel-sector lengths for COMPILED.XA tracks (18.75 sectors/sec per channel)"),
    (0x80038AEC, "XA_ReadTrackLengthRef1", "References g_XATrackLengths"),
    (0x80038CBC, "XA_ReadTrackLengthRef2", "References g_XATrackLengths"),

    # Master String Table & Cheats
    (0x800BF2E0, "g_StringTable", "1387 localized string pointers (0x800BF2E0..0x800C0888)"),
    (0x800C028C, "g_CheatStringPtrs", "Cheat menu strings inside g_StringTable (Perfect balance .. Officer Dick)"),
    (0x80026C48, "Cheats_MenuHandlerRef", "References g_CheatStringPtrs"),
    (0x80067DA0, "Text_LookupStringRef1", "References g_StringTable"),

    # Timer & Patched Sites
    (0x80016848, "PATCH_SITE_120_to_300", "Patched in SLUS_010.66: addiu v0, zero, 120 -> 300"),
    (0x8005F320, "LOOP_8BYTE_SHIFT", "WARNING: corrupted in rep/SLUS_010.66.bak (keep original 0x2484FFF8 / 0x24C6FFFF)"),
    (0x800833E8, "Timer_60000ms_Ref", "Uses immediate 60000 (0xEA60)"),
]

addr_factory = currentProgram.getAddressFactory()
sym_table = currentProgram.getSymbolTable()
listing = currentProgram.getListing()

applied = 0
for addr_int, name, comment in SYMBOLS:
    addr = addr_factory.getDefaultAddressSpace().getAddress(addr_int)
    try:
        sym_table.createLabel(addr, name, SourceType.USER_DEFINED)
        cu = listing.getCodeUnitAt(addr)
        if cu is not None:
            cu.setComment(cu.EOL_COMMENT, comment)
        applied += 1
    except Exception as e:
        print("Failed at 0x%08X (%s): %s" % (addr_int, name, str(e)))

print("THPS2 symbols applied: %d / %d" % (applied, len(SYMBOLS)))
