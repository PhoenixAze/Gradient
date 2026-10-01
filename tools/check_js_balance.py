"""
Minimal JS balans yoxlayicisi (CI üçün).
Məqsəd: innerHTML qadağası, unudulmuş braket və səhv yekun sətri aşkarlamaq.
Bu tam JS parser DEYİL — şablon literal-ləri, sətirləri və şərhləri
birləşdirən sadə bir vəziyyət maşınıdır.
"""
import sys

def check(path):
    src = open(path, encoding="utf-8").read()
    stack = []
    i = 0
    n = len(src)
    line = 1
    state = None  # None | '"' | "'" | '`' | '//' | '/*'
    while i < n:
        ch = src[i]
        if ch == "\n":
            line += 1
            # QEYD: yalnız `//` sətir şərhi sətir sonunda bitir.
            # `/* ... */` isə çoxsətirli ola bilər — onu sətir sonunda
            # dayandırmaq bütün faylın təhlilini pozur (bracetlər saxta uyğunsuzluq yaradır).
            if state == "//":
                state = None
            i += 1
            continue
        if state == "//":
            i += 1
            continue
        if state == "/*":
            if ch == "*" and i + 1 < n and src[i + 1] == "/":
                state = None
                i += 2
                continue
            i += 1
            continue
        if state in ('"', "'", "`"):
            if ch == "\\":
                i += 2
                continue
            if ch == state:
                state = None
            i += 1
            continue
        # normal vəziyyət
        if ch == "/" and i + 1 < n and src[i + 1] == "/":
            state = "//"
            i += 2
            continue
        if ch == "/" and i + 1 < n and src[i + 1] == "*":
            state = "/*"
            i += 2
            continue
        if ch in ('"', "'", "`"):
            state = ch
            i += 1
            continue
        if ch in "{([":
            stack.append((ch, line))
        elif ch in "})]":
            if not stack:
                return f"FAIL {path}: sətir {line} — artıq '{ch}'"
            open_ch, open_line = stack.pop()
            if "{([".index(open_ch) != "})]".index(ch):
                return f"FAIL {path}: sətir {line} — '{open_ch}' (sətir {open_line}) '{ch}' ilə uyğun deyil"
        i += 1
    if state in ('"', "'", "`"):
        return f"FAIL {path}: {state} açıq qalıb (sətir {line})"
    if stack:
        open_ch, open_line = stack[-1]
        return f"FAIL {path}: '{open_ch}' (sətir {open_line}) bağlanmayıb"
    return f"OK   {path}"

if __name__ == "__main__":
    failed = False
    for p in sys.argv[1:]:
        result = check(p)
        print(result)
        if result.startswith("FAIL"):
            failed = True
    sys.exit(1 if failed else 0)