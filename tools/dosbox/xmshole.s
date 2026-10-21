# XMSHOLE.COM: work around a DOSBox-X XMS bug that garbles Dark Planet's sound effects.
#
# SMIX (in DP.EXE) allocates its shared sound block with 0 KB and grows it with XMS
# function 0Fh while loading sounds. DOSBox-X gives a 0 KB block the next free page
# without reserving it (src/ints/xms.cpp, XMS_AllocateMemory), and growing it to one
# page still doesn't reserve it (src/hardware/memory.cpp, MEM_ReAllocatePages). DP then
# allocates its 4.5 MB block on that same page, and the two blocks overlap: sprite data
# overwrites the samples. See docs/re-notes.md "SFX in DOSBox-X".
#
# Run this before DP.EXE. It leaves 24 one-page (4 KB) holes between 4 KB fences that
# stay allocated. EMS allocations fill the smallest holes first (DP takes 64 KB = 16
# pages), and SMIX gets one of the remaining holes. When its block grows past one page,
# the next page is a fence, so DOSBox-X moves the block to properly reserved pages.
#
# Build: as --32 -o xmshole.o xmshole.s && objcopy -O binary -j .text xmshole.o XMSHOLE.COM
        .code16
        .text
start:
        mov     $0x4300, %ax        # XMS installed?
        int     $0x2f
        cmp     $0x80, %al
        jne     done
        mov     $0x4310, %ax        # get the XMS driver entry point
        int     $0x2f
        mov     %bx, xms+0x100      # +0x100: a .COM file is loaded at offset 0x100
        mov     %es, xms+0x102
        mov     $24, %cx
        mov     $handles+0x100, %di
alloc:
        push    %cx
        mov     $0x09, %ah          # allocate 4 KB: future hole
        mov     $4, %dx
        lcall   *xms+0x100
        mov     %dx, (%di)
        add     $2, %di
        mov     $0x09, %ah          # allocate 4 KB: fence, kept
        mov     $4, %dx
        lcall   *xms+0x100
        pop     %cx
        loop    alloc
        mov     $24, %cx
        mov     $handles+0x100, %si
free:
        push    %cx
        mov     $0x0a, %ah          # free the hole
        mov     (%si), %dx
        add     $2, %si
        lcall   *xms+0x100
        pop     %cx
        loop    free
done:
        mov     $0x4c00, %ax
        int     $0x21
xms:    .long 0
handles:
