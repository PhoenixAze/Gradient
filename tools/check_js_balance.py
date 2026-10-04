"""
Minimal JS balans yoxlayicisi (CI üçün).
Məqsəd: unudulmuş braket, açıq sətir/s şərh və səhv yekun sətri aşkarlamaq.

Bu tam JS parser DEYİL — şablon literal-ləri, sətirləri, şərhləri və
regex literallarını izləyən sadə bir vəziyyət maşınıdır.

QEYD (regex dəstəyi): Əvvəlki versiya regex literallarını (məsələn
`/^\\d+[.)]\\s+/`) nəzərə almayırdı. `[.)]` içindəki `)` parens kimi
sayılırdı və faylda sintaksis xətası OLMADIĞI halda da "FAIL" verirdi.
"""
import sys


def _skip_regex(src, i, n):
    """Regex literal-ın sonunu tapır və yekun indeks+1 qaytarır.

    `/` regular ifadə:
      • `[...]` xarakter sinfi daxilində `]` heç vaxt literal yekun deyil
        (`[])]` → həm `]`, həm `)` literalə aiddir).
      • `\\` escape simvolu növbəti qaçırır.

    Sətir sonuna qədər yekun `/` tapılmasa `None` qaytarılır — bu halda
    `/` bölmə operatoru sayılır (bölünmə sətir sərhədini keçmir).
    """
    i += 1  # açılış `/` keçilir
    in_class = False
    while i < n:
        ch = src[i]
        if ch == "\\":
            i += 2
            continue
        if ch == "\n":
            return None  # sətir sərhədi → ehtimal ki bölmə operatoru
        if ch == "[":
            in_class = True
        elif ch == "]":
            in_class = False
        elif ch == "/" and not in_class:
            return i + 1
        i += 1
    return None


#: Bunlardan SONRA gələn `/` bölmə operatorudur, regex deyil.
_NOT_REGEX_BEFORE = ('"', "'", ")", "]", "}", "IDENT", "NUMBER")


def check(path):
    src = open(path, encoding="utf-8").read()
    stack = []
    i = 0
    n = len(src)
    line = 1
    state = None  # None | '"' | "'" | '`' | '//' | '/*'
    prev = ""  # son əhəmiyyətli simvol (regex aşkarlığı üçün)

    while i < n:
        ch = src[i]

        if ch == "\n":
            line += 1
            # QEYD: yalnız `//` sətir şərhi sətir sonunda bitir.
            # `/* ... */` isə çoxsətirli ola bilər.
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

        # --- normal vəziyyət ---
        if ch == "/" and i + 1 < n and src[i + 1] == "/":
            state = "//"
            i += 2
            continue

        if ch == "/" and i + 1 < n and src[i + 1] == "*":
            state = "/*"
            i += 2
            continue

        # Regex literal aşkarlığı: `/` yalnız operand mövqeyində regex-dir.
        # Uğurlu tapılmasa sadəcə növbəti keçilir (bölmə operatoru).
        if ch == "/" and prev not in _NOT_REGEX_BEFORE:
            end = _skip_regex(src, i, n)
            if end is not None:
                # Bütün literal bir əməliyyatla ötürülür (i = end).
                i = end
                prev = "IDENT"  # flag-lər (g/i/m/s) operand kimi sayılır
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
                return (
                    f"FAIL {path}: sətir {line} — '{open_ch}' "
                    f"(sətir {open_line}) '{ch}' ilə uyğun deyil"
                )

        # Son əhəmiyyətli simvolu yenilə (boşluq nəzərə alınmır).
        if not ch.isspace():
            if ch.isdigit():
                prev = "NUMBER"
            elif ch.isalpha() or ch in "_$":
                prev = "IDENT"
            else:
                prev = ch
        i += 1

    if state in ('"', "'", "`"):
        return f"FAIL {path}: {state} açıq qalıb (sətir {line})"
    if state == "/*":
        return f"FAIL {path}: şərh açıq qalıb (sətir {line})"
    if stack:
        open_ch, open_line = stack[-1]
        return f"FAIL {path}: '{open_ch}' (sətir {open_line}) bağlanmayıb"
    return f"OK   {path}"


if __name__ == "__main__":
    failed = False
    for p in sys.argv[1:]:
        result = check(p)
        # Windows konsolu (cp1254) UTF-8 simvollarını yaza bilmir.
        print(result.encode("ascii", "replace").decode("ascii"))
        if result.startswith("FAIL"):
            failed = True
    sys.exit(1 if failed else 0)
