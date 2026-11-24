"""受限 C 子集解释器：在纯 Python 中真实执行教学用 C 代码。
不依赖生成可执行文件，规避本机应用控制策略；不支持完整 C11（如 struct/文件 IO）。
"""
import re
from dataclasses import dataclass, field

MAX_STEPS = 200000
MAX_DEPTH = 80


class CError(Exception):
    pass


@dataclass
class Cell:
    value: object = 0

    def get(self):
        return self.value

    def set(self, v):
        self.value = v


@dataclass
class Ptr:
    target: object
    offset: int = 0

    def cell(self):
        t = self.target
        if isinstance(t, ArrayRef):
            idx = self.offset
            if idx < 0 or idx >= len(t.cells):
                raise CError("指针越界访问")
            return t.cells[idx]
        if self.offset != 0:
            raise CError("不支持对普通变量指针做偏移")
        return t if isinstance(t, Cell) else Cell(t)


@dataclass
class ArrayRef:
    cells: list = field(default_factory=list)
    elem_size: int = 4


@dataclass
class Func:
    name: str
    params: list
    body: object
    variadic: bool = False


def _esc(s: str) -> str:
    return (s.replace("\\n", "\n").replace("\\t", "\t").replace("\\0", "\0")
             .replace('\\"', '"').replace("\\'", "'").replace("\\\\", "\\"))


TOKEN_RE = re.compile(
    r'\s*(?:(//[^\n]*)|(/\*.*?\*/)|("(?:\\.|[^"\\])*")|(\'(?:\\.|[^\'\\])*\')'
    r'|([A-Za-z_]\w*)|(\d+\.?\d*(?:[eE][+-]?\d+)?)|'
    r'(<=|>=|==|!=|&&|\|\||\+\+|--|\+=|-=|\*=|/=|%=|%-=|%|.))', re.S)


def tokenize(src: str) -> list[tuple[str, str]]:
    src = "\n".join(line for line in src.splitlines() if not line.strip().startswith("#"))
    out = []
    for m in TOKEN_RE.finditer(src):
        if m.group(1) or m.group(2):
            continue
        if m.group(3):
            out.append(("STR", _esc(m.group(3)[1:-1])))
        elif m.group(4):
            out.append(("STR", _esc(m.group(4)[1:-1])))
        elif m.group(5):
            out.append(("ID", m.group(5)))
        elif m.group(6):
            out.append(("NUM", m.group(6)))
        elif m.group(7):
            out.append(("OP", m.group(7)))
    out.append(("EOF", ""))
    return out


class Parser:
    def __init__(self, tokens):
        self.t = tokens
        self.i = 0

    def peek(self, k=0):
        return self.t[min(self.i + k, len(self.t) - 1)]

    def at(self, value):
        return self.peek()[1] == value

    def eat(self, value=None):
        tok = self.peek()
        if value is not None and tok[1] != value:
            raise CError(f"期望 '{value}'，实际遇到 '{tok[1]}'")
        self.i += 1
        return tok

    def parse(self):
        nodes = []
        while self.peek()[0] != "EOF":
            if self.at("#"):
                while self.peek()[0] != "EOF" and not self.peek()[1].startswith("\n"):
                    self.eat()
                continue
            if self.at(";"):
                self.eat()
                continue
            nodes.append(self.function())
        return nodes

    def function(self):
        self.eat()
        name = self.eat()[1]
        self.eat("(")
        params = []
        variadic = False
        while not self.at(")"):
            if self.at("..."):
                variadic = True
                self.eat()
                break
            while self.peek()[1] in self.TYPES:
                self.eat()
            while self.at("*"):
                self.eat()
            if self.at(")") or self.at(","):
                break
            params.append(self.eat()[1])
            if self.at(","):
                self.eat()
        self.eat(")")
        if self.at(";"):
            self.eat()
            return ("proto", name, params)
        body = self.block()
        return ("func", Func(name, params, body, variadic))

    def block(self):
        self.eat("{")
        stmts = []
        while not self.at("}"):
            if self.peek()[0] == "EOF":
                raise CError("缺少右花括号 }")
            stmts.append(self.statement())
        self.eat("}")
        return ("block", stmts)

    def statement(self):
        if self.at("{"):
            return self.block()
        if self.at("if"):
            self.eat("if")
            self.eat("(")
            cond = self.expression()
            self.eat(")")
            then = self.statement()
            other = self.statement() if self.at("else") else None
            if other:
                self.eat("else")
            return ("if", cond, then, other)
        if self.at("while"):
            self.eat("while")
            self.eat("(")
            cond = self.expression()
            self.eat(")")
            return ("while", cond, self.statement())
        if self.at("do"):
            self.eat("do")
            body = self.statement()
            self.eat("while")
            self.eat("(")
            cond = self.expression()
            self.eat(")")
            self.eat(";")
            return ("do", body, cond)
        if self.at("for"):
            self.eat("for")
            self.eat("(")
            init = self.expression(allow_decl=True) if not self.at(";") else None
            self.eat(";")
            cond = self.expression() if not self.at(";") else None
            self.eat(";")
            step = self.expression() if not self.at(")") else None
            self.eat(")")
            return ("for", init, cond, step, self.statement())
        if self.at("return"):
            self.eat("return")
            expr = self.expression() if not self.at(";") else ("num", 0)
            self.eat(";")
            return ("return", expr)
        if self.at("break"):
            self.eat("break"); self.eat(";")
            return ("break",)
        if self.at("continue"):
            self.eat("continue"); self.eat(";")
            return ("continue",)
        node = self.expression(allow_decl=True)
        self.eat(";")
        return ("expr", node)

    TYPES = {"int", "char", "double", "float", "long", "short", "unsigned", "void", "size_t", "const", "static"}

    def expression(self, allow_decl=False):
        if allow_decl and self.peek()[1] in self.TYPES:
            decls = []
            while self.peek()[1] in self.TYPES:
                self.eat()
            while True:
                stars = 0
                while self.at("*"):
                    self.eat(); stars += 1
                name = self.eat()[1]
                init = None
                if self.at("["):
                    self.eat()
                    size = None
                    if not self.at("]"):
                        size = self.assign()
                    self.eat("]")
                    items = None
                    if self.at("="):
                        self.eat()
                        if self.at("{"):
                            self.eat()
                            items = []
                            while not self.at("}"):
                                items.append(self.assign())
                                if self.at(","):
                                    self.eat()
                            self.eat("}")
                        else:
                            items = [self.assign()]
                    init = ("array", size, items)
                elif self.at("="):
                    self.eat()
                    init = self.assign()
                decls.append((name, stars, init))
                if self.at(","):
                    self.eat()
                    continue
                break
            return ("decl", decls)
        return self.assign()

    def assign(self):
        left = self.ternary()
        if self.peek()[1] in ("=", "+=", "-=", "*=", "/="):
            op = self.eat()[1]
            right = self.assign()
            return ("assign", op, left, right)
        return left

    def ternary(self):
        cond = self.binary(0)
        if self.at("?"):
            self.eat()
            a = self.assign()
            self.eat(":")
            b = self.assign()
            return ("ternary", cond, a, b)
        return cond

    OPS = [("||",), ("&&",), ("==", "!="), ("<", ">", "<=", ">="),
           ("+", "-"), ("*", "/", "%")]

    def binary(self, level):
        if level >= len(self.OPS):
            return self.unary()
        node = self.binary(level + 1)
        while self.peek()[1] in self.OPS[level]:
            op = self.eat()[1]
            rhs = self.binary(level + 1)
            node = ("bin", op, node, rhs)
        return node

    def unary(self):
        if self.peek()[1] in ("!", "-", "+", "&", "*", "++", "--"):
            op = self.eat()[1]
            return ("un", op, self.unary())
        return self.postfix()

    def postfix(self):
        node = self.primary()
        while True:
            if self.at("["):
                self.eat()
                idx = self.expression()
                self.eat("]")
                node = ("index", node, idx)
            elif self.at("("):
                self.eat()
                args = []
                while not self.at(")"):
                    args.append(self.assign())
                    if self.at(","):
                        self.eat()
                self.eat(")")
                node = ("call", node, args)
            elif self.peek()[1] in ("++", "--"):
                op = self.eat()[1]
                node = ("post", op, node)
            else:
                break
        return node

    def primary(self):
        tok = self.peek()
        if tok[1] == "(":
            self.eat()
            node = self.expression()
            self.eat(")")
            return node
        if tok[0] == "NUM":
            self.eat()
            return ("num", float(tok[1]) if any(c in tok[1] for c in ".eE") else int(tok[1], 0))
        if tok[0] == "STR":
            self.eat()
            return ("str", tok[1])
        if tok[0] == "ID":
            self.eat()
            return ("id", tok[1])
        raise CError(f"无法解析的符号 '{tok[1]}'")


class ReturnSignal(Exception):
    def __init__(self, value):
        self.value = value


class BreakSignal(Exception):
    pass


class ContinueSignal(Exception):
    pass


def _fmt_printf(fmt: str, args: list) -> str:
    out = []
    i = ai = 0
    while i < len(fmt):
        if fmt[i] != "%":
            out.append(fmt[i]); i += 1; continue
        if i + 1 < len(fmt) and fmt[i + 1] == "%":
            out.append("%"); i += 2; continue
        m = re.match(r"%([-+0-9.]*)(zu|[diufexXcs]|%)", fmt[i:])
        if not m:
            out.append(fmt[i]); i += 1; continue
        flags, spec = m.group(1), m.group(2)
        v = args[ai] if ai < len(args) else 0
        ai += 1
        if spec in ("di", "zu"):
            out.append(str(int(v)))
        elif spec in "fu":
            prec = 6
            pm = re.search(r"\.(\d+)", flags)
            if pm:
                prec = int(pm.group(1))
            out.append(f"{float(v):.{prec}f}")
        elif spec == "s":
            out.append(str(v))
        elif spec == "c":
            out.append(chr(int(v)) if 0 <= int(v) < 0x110000 else "?")
        elif spec in "xX":
            out.append(format(int(v), spec))
        else:
            out.append(str(int(v)))
        i += m.end()
    return "".join(out)


class Interpreter:
    def __init__(self):
        self.scopes = [{}]
        self.funcs: dict[str, Func] = {}
        self.steps = 0
        self.output = []

    def lookup(self, name):
        for scope in reversed(self.scopes):
            if name in scope:
                return scope[name]
        raise CError(f"变量 '{name}' 未声明")

    def declare(self, name, stars, init, node):
        if init is None:
            val = Cell(Ptr(Cell(0))) if stars else Cell(0)
        elif isinstance(init, tuple) and init[0] == "array":
            items = init[2] or []
            if init[1] is not None:
                size = int(self.eval(init[1]))
            elif len(items) == 1 and items[0][0] == "str":
                size = len(items[0][1]) + 1
            else:
                size = len(items)
            if size < 0 or size > 10000:
                raise CError("数组长度无效")
            cells = [Cell(0) for _ in range(size)]
            for idx, item in enumerate(items[:size]):
                if item[0] == "str":
                    for j, ch in enumerate(item[1]):
                        if idx + j < size:
                            cells[idx + j].set(ord(ch))
                else:
                    cells[idx].set(self.eval(item))
            elem_size = 1 if (items and items[0][0] == "str") else 4
            val = Cell(ArrayRef(cells, elem_size))
        else:
            v = self.eval(init)
            if stars:
                if isinstance(v, ArrayRef):
                    val = Cell(Ptr(v, 0))
                elif isinstance(v, Ptr):
                    val = Cell(v)
                else:
                    val = Cell(Ptr(Cell(v)))
            else:
                val = Cell(v)
        self.scopes[-1][name] = val
        return val

    def assign_to(self, left, value):
        if left[0] == "id":
            target = self.lookup(left[1])
            if isinstance(target, Cell):
                target.set(value)
            else:
                self.scopes[-1][left[1]] = Cell(value)
            return
        if left[0] == "un" and left[1] == "*":
            p = self.eval(left[2])
            if not isinstance(p, Ptr):
                raise CError("不能对非指针解引用赋值")
            p.cell().set(value)
            return
        if left[0] == "index":
            arr = self.eval(left[1])
            idx = int(self.eval(left[2]))
            if isinstance(arr, ArrayRef):
                if idx < 0 or idx >= len(arr.cells):
                    raise CError(f"数组下标越界：{idx}")
                arr.cells[idx].set(value)
            elif isinstance(arr, Ptr):
                arr.target.cells[arr.offset + idx].set(value)
            else:
                raise CError("下标操作对象不是数组")
            return
        raise CError("赋值目标无效")

    def eval(self, node):
        self.steps += 1
        if self.steps > MAX_STEPS:
            raise CError("执行步数超限，可能存在死循环")
        kind = node[0]
        if kind == "num" or kind == "str":
            return node[1]
        if kind == "id":
            name = node[1]
            if name in self.funcs:
                return self.funcs[name]
            v = self.lookup(name)
            return v.get() if isinstance(v, Cell) else v
        if kind == "decl":
            for name, stars, init in node[1]:
                self.declare(name, stars, init, node)
            return 0
        if kind == "assign":
            op, left, right = node[1], node[2], node[3]
            rv = self.eval(right)
            if op != "=":
                lv = self.eval(left)
                rv = {"+=": lambda: lv + rv, "-=": lambda: lv - rv,
                      "*=": lambda: lv * rv, "/=": lambda: lv / rv}[op]()
            self.assign_to(left, rv)
            return rv
        if kind == "bin":
            op = node[1]
            a = self.eval(node[2])
            if op == "&&" and not a:
                return 0
            if op == "||" and a:
                return 1
            b = self.eval(node[3])
            if isinstance(a, Ptr):
                if op == "+":
                    return Ptr(a.target, a.offset + int(b))
                if op == "-":
                    return Ptr(a.target, a.offset - int(b))
            try:
                return {
                    "+": lambda: a + b, "-": lambda: a - b, "*": lambda: a * b,
                    "/": lambda: (int(a / b) if isinstance(a, int) and isinstance(b, int) and b else a / b),
                    "%": lambda: int(a) % int(b),
                    "==": lambda: int(a == b), "!=": lambda: int(a != b),
                    "<": lambda: int(a < b), ">": lambda: int(a > b),
                    "<=": lambda: int(a <= b), ">=": lambda: int(a >= b),
                    "&&": lambda: int(bool(a) and bool(b)),
                    "||": lambda: int(bool(a) or bool(b)),
                }[op]()
            except ZeroDivisionError:
                raise CError("运行时错误：除以零")
        if kind == "un":
            op = node[1]
            if op == "!":
                return int(not self.eval(node[2]))
            if op == "-":
                return -self.eval(node[2])
            if op == "+":
                return self.eval(node[2])
            if op == "&":
                v = node[2]
                if v[0] != "id":
                    raise CError("& 只能作用于变量")
                target = self.lookup(v[1])
                if not isinstance(target, Cell):
                    raise CError("& 只能作用于变量")
                inner = target.get()
                if isinstance(inner, ArrayRef):
                    return Ptr(inner, 0)
                return Ptr(target)
            if op == "*":
                p = self.eval(node[2])
                if not isinstance(p, Ptr):
                    raise CError("不能对非指针解引用")
                return p.cell().get()
        if kind == "post":
            op, target = node[1], node[2]
            old = self.eval(target)
            self.assign_to(target, old + 1 if op == "++" else old - 1)
            return old
        if kind == "index":
            arr = self.eval(node[1])
            idx = int(self.eval(node[2]))
            if isinstance(arr, ArrayRef):
                if idx < 0 or idx >= len(arr.cells):
                    raise CError(f"数组下标越界：{idx}")
                return arr.cells[idx].get()
            if isinstance(arr, Ptr):
                if not isinstance(arr.target, ArrayRef):
                    raise CError("下标操作对象不是数组")
                pos = arr.offset + idx
                if pos < 0 or pos >= len(arr.target.cells):
                    raise CError(f"指针下标越界：{pos}")
                return arr.target.cells[pos].get()
            raise CError("下标操作对象不是数组")
        if kind == "ternary":
            return self.eval(node[2] if self.eval(node[1]) else node[3])
        if kind == "call":
            return self.call(node)
        raise CError(f"不支持的表达式：{kind}")

    def call(self, node):
        name_node = node[1]
        name = name_node[1] if name_node[0] == "id" else ""
        if name == "sizeof":
            raw = node[2][0] if node[2] else None
            if raw and raw[0] == "id":
                try:
                    v = self.lookup(raw[1]).get()
                    if isinstance(v, ArrayRef):
                        return len(v.cells) * v.elem_size
                except CError:
                    pass
            return 4
        raw_args = [self.eval(a) for a in node[2]]
        args = []
        for v in raw_args:
            if isinstance(v, ArrayRef):
                args.append("".join(chr(c.get()) for c in v.cells if c.get()))
            else:
                args.append(v)
        if name == "printf":
            self.output.append(_fmt_printf(str(args[0]), args[1:]))
            return len("".join(self.output))
        if name == "puts":
            self.output.append(str(args[0]) + "\n")
            return 0
        if name == "strlen":
            return len(str(args[0]))
        if name == "abs":
            return abs(args[0])
        f = self.funcs.get(name)
        if not f:
            raise CError(f"不支持的函数调用：{name}()")
        if len(args) != len(f.params) and not f.variadic:
            raise CError(f"函数 {name} 参数数量不匹配")
        if len(self.scopes) > MAX_DEPTH:
            raise CError("递归深度超限")
        frame = {}
        for i, p in enumerate(f.params):
            frame[p] = Cell(args[i]) if i < len(args) else Cell(0)
        self.scopes.append(frame)
        try:
            self.exec(f.body)
            return 0
        except ReturnSignal as r:
            return r.value
        finally:
            self.scopes.pop()

    def exec(self, node):
        kind = node[0]
        self.steps += 1
        if self.steps > MAX_STEPS:
            raise CError("执行步数超限，可能存在死循环")
        if kind == "block":
            for s in node[1]:
                self.exec(s)
        elif kind == "expr":
            self.eval(node[1])
        elif kind == "decl":
            self.eval(node)
        elif kind == "if":
            if self.eval(node[1]):
                self.exec(node[2])
            elif node[3]:
                self.exec(node[3])
        elif kind == "while":
            while self.eval(node[1]):
                try:
                    self.exec(node[2])
                except BreakSignal:
                    break
                except ContinueSignal:
                    continue
        elif kind == "do":
            while True:
                try:
                    self.exec(node[1])
                except BreakSignal:
                    break
                except ContinueSignal:
                    pass
                if not self.eval(node[2]):
                    break
        elif kind == "for":
            if node[1]:
                self.eval(node[1])
            while node[2] is None or self.eval(node[2]):
                try:
                    self.exec(node[4])
                except BreakSignal:
                    break
                except ContinueSignal:
                    pass
                if node[3]:
                    self.eval(node[3])
        elif kind == "return":
            raise ReturnSignal(self.eval(node[1]))
        elif kind == "break":
            raise BreakSignal()
        elif kind == "continue":
            raise ContinueSignal()

    def run(self, ast):
        for node in ast:
            if node[0] == "func":
                self.funcs[node[1].name] = node[1]
        main = self.funcs.get("main")
        if not main:
            raise CError("缺少 main 函数")
        self.scopes.append({})
        try:
            self.exec(main.body)
            return 0
        except ReturnSignal as r:
            return int(r.value) if isinstance(r.value, (int, float)) else 0
        finally:
            self.scopes.pop()


def run_source(code: str) -> dict:
    interp = Interpreter()
    try:
        ast = Parser(tokenize(code)).parse()
        rc = interp.run(ast)
        return {"ok": True, "stdout": "".join(interp.output)[:4000], "exit_code": rc}
    except CError as e:
        return {"ok": False, "error": str(e), "stdout": "".join(interp.output)[:2000]}
    except Exception as e:
        return {"ok": False, "error": f"解释器无法执行该语法：{type(e).__name__}: {e}",
                "stdout": "".join(interp.output)[:2000]}
