(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };
  var __commonJS = (cb, mod2) => function __require() {
    try {
      return mod2 || (0, cb[__getOwnPropNames(cb)[0]])((mod2 = { exports: {} }).exports, mod2), mod2.exports;
    } catch (e) {
      throw mod2 = 0, e;
    }
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod2, isNodeMode, target) => (target = mod2 != null ? __create(__getProtoOf(mod2)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod2 || !mod2.__esModule ? __defProp(target, "default", { value: mod2, enumerable: true }) : target,
    mod2
  ));
  var __toCommonJS = (mod2) => __copyProps(__defProp({}, "__esModule", { value: true }), mod2);

  // node_modules/nanoassert/index.js
  var require_nanoassert = __commonJS({
    "node_modules/nanoassert/index.js"(exports, module) {
      module.exports = assert;
      var AssertionError = class extends Error {
      };
      AssertionError.prototype.name = "AssertionError";
      function assert(t, m) {
        if (!t) {
          var err = new AssertionError(m);
          if (Error.captureStackTrace) Error.captureStackTrace(err, assert);
          throw err;
        }
      }
    }
  });

  // node_modules/b4a/lib/ascii.js
  var require_ascii = __commonJS({
    "node_modules/b4a/lib/ascii.js"(exports, module) {
      function byteLength(string) {
        return string.length;
      }
      function toString(buffer) {
        const len = buffer.byteLength;
        let result = "";
        for (let i = 0; i < len; i++) {
          result += String.fromCharCode(buffer[i] & 127);
        }
        return result;
      }
      function write(buffer, string) {
        const len = buffer.byteLength;
        for (let i = 0; i < len; i++) {
          buffer[i] = string.charCodeAt(i);
        }
        return len;
      }
      module.exports = {
        byteLength,
        toString,
        write
      };
    }
  });

  // node_modules/b4a/lib/base64.js
  var require_base64 = __commonJS({
    "node_modules/b4a/lib/base64.js"(exports, module) {
      var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      var codes = new Uint8Array(256);
      for (let i = 0; i < alphabet.length; i++) {
        codes[alphabet.charCodeAt(i)] = i;
      }
      codes[
        /* - */
        45
      ] = 62;
      codes[
        /* _ */
        95
      ] = 63;
      function byteLength(string) {
        let len = string.length;
        if (string.charCodeAt(len - 1) === 61) len--;
        if (len > 1 && string.charCodeAt(len - 1) === 61) len--;
        return len * 3 >>> 2;
      }
      function toString(buffer) {
        const len = buffer.byteLength;
        let result = "";
        for (let i = 0; i < len; i += 3) {
          result += alphabet[buffer[i] >> 2] + alphabet[(buffer[i] & 3) << 4 | buffer[i + 1] >> 4] + alphabet[(buffer[i + 1] & 15) << 2 | buffer[i + 2] >> 6] + alphabet[buffer[i + 2] & 63];
        }
        if (len % 3 === 2) {
          result = result.substring(0, result.length - 1) + "=";
        } else if (len % 3 === 1) {
          result = result.substring(0, result.length - 2) + "==";
        }
        return result;
      }
      function write(buffer, string) {
        const len = buffer.byteLength;
        for (let i = 0, j = 0; j < len; i += 4) {
          const a = codes[string.charCodeAt(i)];
          const b = codes[string.charCodeAt(i + 1)];
          const c = codes[string.charCodeAt(i + 2)];
          const d = codes[string.charCodeAt(i + 3)];
          buffer[j++] = a << 2 | b >> 4;
          buffer[j++] = (b & 15) << 4 | c >> 2;
          buffer[j++] = (c & 3) << 6 | d & 63;
        }
        return len;
      }
      module.exports = {
        byteLength,
        toString,
        write
      };
    }
  });

  // node_modules/b4a/lib/hex.js
  var require_hex = __commonJS({
    "node_modules/b4a/lib/hex.js"(exports, module) {
      function byteLength(string) {
        return string.length >>> 1;
      }
      function toString(buffer) {
        const len = buffer.byteLength;
        buffer = new DataView(buffer.buffer, buffer.byteOffset, len);
        let result = "";
        let i = 0;
        for (let n = len - len % 4; i < n; i += 4) {
          result += buffer.getUint32(i).toString(16).padStart(8, "0");
        }
        for (; i < len; i++) {
          result += buffer.getUint8(i).toString(16).padStart(2, "0");
        }
        return result;
      }
      function write(buffer, string) {
        const len = buffer.byteLength;
        for (let i = 0; i < len; i++) {
          const a = hexValue(string.charCodeAt(i * 2));
          const b = hexValue(string.charCodeAt(i * 2 + 1));
          if (a === void 0 || b === void 0) {
            return i;
          }
          buffer[i] = a << 4 | b;
        }
        return len;
      }
      module.exports = {
        byteLength,
        toString,
        write
      };
      function hexValue(char) {
        if (char >= 48 && char <= 57) return char - 48;
        if (char >= 65 && char <= 70) return char - 65 + 10;
        if (char >= 97 && char <= 102) return char - 97 + 10;
      }
    }
  });

  // node_modules/b4a/lib/latin1.js
  var require_latin1 = __commonJS({
    "node_modules/b4a/lib/latin1.js"(exports, module) {
      function byteLength(string) {
        return string.length;
      }
      function toString(buffer) {
        const len = buffer.byteLength;
        let result = "";
        for (let i = 0; i < len; i++) {
          result += String.fromCharCode(buffer[i]);
        }
        return result;
      }
      function write(buffer, string) {
        const len = buffer.byteLength;
        for (let i = 0; i < len; i++) {
          buffer[i] = string.charCodeAt(i);
        }
        return len;
      }
      module.exports = {
        byteLength,
        toString,
        write
      };
    }
  });

  // node_modules/b4a/lib/utf8.js
  var require_utf8 = __commonJS({
    "node_modules/b4a/lib/utf8.js"(exports, module) {
      function byteLength(string) {
        let length = 0;
        for (let i = 0, n = string.length; i < n; i++) {
          const code = string.charCodeAt(i);
          if (code >= 55296 && code <= 56319 && i + 1 < n) {
            const code2 = string.charCodeAt(i + 1);
            if (code2 >= 56320 && code2 <= 57343) {
              length += 4;
              i++;
              continue;
            }
          }
          if (code <= 127) length += 1;
          else if (code <= 2047) length += 2;
          else length += 3;
        }
        return length;
      }
      var toString;
      if (typeof TextDecoder !== "undefined") {
        const decoder2 = new TextDecoder();
        toString = function toString2(buffer) {
          return decoder2.decode(buffer);
        };
      } else {
        toString = function toString2(buffer) {
          const len = buffer.byteLength;
          let output = "";
          let i = 0;
          while (i < len) {
            let byte = buffer[i];
            if (byte <= 127) {
              output += String.fromCharCode(byte);
              i++;
              continue;
            }
            let bytesNeeded = 0;
            let codePoint = 0;
            if (byte <= 223) {
              bytesNeeded = 1;
              codePoint = byte & 31;
            } else if (byte <= 239) {
              bytesNeeded = 2;
              codePoint = byte & 15;
            } else if (byte <= 244) {
              bytesNeeded = 3;
              codePoint = byte & 7;
            }
            if (len - i - bytesNeeded > 0) {
              let k = 0;
              while (k < bytesNeeded) {
                byte = buffer[i + k + 1];
                codePoint = codePoint << 6 | byte & 63;
                k += 1;
              }
            } else {
              codePoint = 65533;
              bytesNeeded = len - i;
            }
            output += String.fromCodePoint(codePoint);
            i += bytesNeeded + 1;
          }
          return output;
        };
      }
      var write;
      if (typeof TextEncoder !== "undefined") {
        const encoder2 = new TextEncoder();
        write = function write2(buffer, string) {
          return encoder2.encodeInto(string, buffer).written;
        };
      } else {
        write = function write2(buffer, string) {
          const len = buffer.byteLength;
          let i = 0;
          let j = 0;
          while (i < string.length) {
            const code = string.codePointAt(i);
            if (code <= 127) {
              if (j + 1 > len) break;
              buffer[j++] = code;
              i++;
              continue;
            }
            let count = 0;
            let bits = 0;
            if (code <= 2047) {
              count = 6;
              bits = 192;
            } else if (code <= 65535) {
              count = 12;
              bits = 224;
            } else if (code <= 2097151) {
              count = 18;
              bits = 240;
            }
            if (j + count / 6 + 1 > len) break;
            buffer[j++] = bits | code >> count;
            count -= 6;
            while (count >= 0) {
              buffer[j++] = 128 | code >> count & 63;
              count -= 6;
            }
            i += code >= 65536 ? 2 : 1;
          }
          return j;
        };
      }
      module.exports = {
        byteLength,
        toString,
        write
      };
    }
  });

  // node_modules/b4a/lib/utf16le.js
  var require_utf16le = __commonJS({
    "node_modules/b4a/lib/utf16le.js"(exports, module) {
      function byteLength(string) {
        return string.length * 2;
      }
      function toString(buffer) {
        const len = buffer.byteLength;
        let result = "";
        for (let i = 0; i < len - 1; i += 2) {
          result += String.fromCharCode(buffer[i] + buffer[i + 1] * 256);
        }
        return result;
      }
      function write(buffer, string) {
        const len = buffer.byteLength;
        let units = len;
        for (let i = 0; i < string.length; ++i) {
          if ((units -= 2) < 0) break;
          const c = string.charCodeAt(i);
          const hi = c >> 8;
          const lo = c % 256;
          buffer[i * 2] = lo;
          buffer[i * 2 + 1] = hi;
        }
        return len;
      }
      module.exports = {
        byteLength,
        toString,
        write
      };
    }
  });

  // node_modules/b4a/browser.js
  var require_browser = __commonJS({
    "node_modules/b4a/browser.js"(exports, module) {
      var ascii = require_ascii();
      var base64 = require_base64();
      var hex = require_hex();
      var latin1 = require_latin1();
      var utf82 = require_utf8();
      var utf16le = require_utf16le();
      var LE = new Uint8Array(Uint16Array.of(255).buffer)[0] === 255;
      function codecFor(encoding) {
        switch (encoding) {
          case "ascii":
            return ascii;
          case "base64":
            return base64;
          case "hex":
            return hex;
          case "binary":
          case "latin1":
            return latin1;
          case "utf8":
          case "utf-8":
          case void 0:
          case null:
            return utf82;
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return utf16le;
          default:
            throw new Error(`Unknown encoding '${encoding}'`);
        }
      }
      function isBuffer(value) {
        return value instanceof Uint8Array;
      }
      function isEncoding(encoding) {
        try {
          codecFor(encoding);
          return true;
        } catch {
          return false;
        }
      }
      function alloc(size, fill2, encoding) {
        const buffer = new Uint8Array(size);
        if (fill2 !== void 0) {
          exports.fill(buffer, fill2, 0, buffer.byteLength, encoding);
        }
        return buffer;
      }
      function allocUnsafe(size) {
        return new Uint8Array(size);
      }
      function allocUnsafeSlow(size) {
        return new Uint8Array(size);
      }
      function byteLength(string, encoding) {
        return codecFor(encoding).byteLength(string);
      }
      function compare(a, b) {
        if (a === b) return 0;
        const len = Math.min(a.byteLength, b.byteLength);
        a = new DataView(a.buffer, a.byteOffset, a.byteLength);
        b = new DataView(b.buffer, b.byteOffset, b.byteLength);
        let i = 0;
        for (let n = len - len % 4; i < n; i += 4) {
          const x = a.getUint32(i, LE);
          const y = b.getUint32(i, LE);
          if (x !== y) break;
        }
        for (; i < len; i++) {
          const x = a.getUint8(i);
          const y = b.getUint8(i);
          if (x < y) return -1;
          if (x > y) return 1;
        }
        return a.byteLength > b.byteLength ? 1 : a.byteLength < b.byteLength ? -1 : 0;
      }
      function concat2(buffers, length) {
        if (length === void 0) {
          length = buffers.reduce((len, buffer) => len + buffer.byteLength, 0);
        }
        const result = new Uint8Array(length);
        let offset = 0;
        for (const buffer of buffers) {
          if (offset + buffer.byteLength > result.byteLength) {
            result.set(buffer.subarray(0, result.byteLength - offset), offset);
            return result;
          }
          result.set(buffer, offset);
          offset += buffer.byteLength;
        }
        return result;
      }
      function copy(source, target, targetStart = 0, sourceStart = 0, sourceEnd = source.byteLength) {
        if (targetStart < 0) targetStart = 0;
        if (targetStart >= target.byteLength) return 0;
        const targetLength = target.byteLength - targetStart;
        if (sourceStart < 0) sourceStart = 0;
        if (sourceStart >= source.byteLength) return 0;
        if (sourceEnd <= sourceStart) return 0;
        if (sourceEnd > source.byteLength) sourceEnd = source.byteLength;
        if (sourceEnd - sourceStart > targetLength) {
          sourceEnd = sourceStart + targetLength;
        }
        const sourceLength = sourceEnd - sourceStart;
        if (source === target) {
          target.copyWithin(targetStart, sourceStart, sourceEnd);
        } else {
          if (sourceStart !== 0 || sourceEnd !== source.byteLength) {
            source = source.subarray(sourceStart, sourceEnd);
          }
          target.set(source, targetStart);
        }
        return sourceLength;
      }
      function equals(a, b) {
        if (a === b) return true;
        if (a.byteLength !== b.byteLength) return false;
        return compare(a, b) === 0;
      }
      function fill(buffer, value, offset = 0, end = buffer.byteLength, encoding = "utf8") {
        if (typeof value === "string") {
          if (typeof offset === "string") {
            encoding = offset;
            offset = 0;
            end = buffer.byteLength;
          } else if (typeof end === "string") {
            encoding = end;
            end = buffer.byteLength;
          }
        } else if (typeof value === "number") {
          value = value & 255;
        } else if (typeof value === "boolean") {
          value = +value;
        }
        if (offset < 0) offset = 0;
        if (offset >= buffer.byteLength) return buffer;
        if (end <= offset) return buffer;
        if (end > buffer.byteLength) end = buffer.byteLength;
        if (typeof value === "number") return buffer.fill(value, offset, end);
        if (typeof value === "string") value = exports.from(value, encoding);
        const len = value.byteLength;
        for (let i = 0, n = end - offset; i < n; ++i) {
          buffer[i + offset] = value[i % len];
        }
        return buffer;
      }
      function from(value, encodingOrOffset, length) {
        if (typeof value === "string") return fromString(value, encodingOrOffset);
        if (Array.isArray(value)) return fromArray(value);
        if (ArrayBuffer.isView(value)) return fromBuffer(value);
        return fromArrayBuffer(value, encodingOrOffset, length);
      }
      function fromString(string, encoding) {
        const codec = codecFor(encoding);
        const buffer = new Uint8Array(codec.byteLength(string));
        codec.write(buffer, string);
        return buffer;
      }
      function fromArray(array) {
        const buffer = new Uint8Array(array.length);
        buffer.set(array);
        return buffer;
      }
      function fromBuffer(buffer) {
        const copy2 = new Uint8Array(buffer.byteLength);
        copy2.set(buffer);
        return copy2;
      }
      function fromArrayBuffer(arrayBuffer, byteOffset, length) {
        return new Uint8Array(arrayBuffer, byteOffset, length);
      }
      function includes(buffer, value, byteOffset, encoding) {
        return indexOf(buffer, value, byteOffset, encoding) !== -1;
      }
      function indexOf(buffer, value, byteOffset, encoding) {
        return bidirectionalIndexOf(
          buffer,
          value,
          byteOffset,
          encoding,
          true
          /* first */
        );
      }
      function lastIndexOf(buffer, value, byteOffset, encoding) {
        return bidirectionalIndexOf(
          buffer,
          value,
          byteOffset,
          encoding,
          false
          /* last */
        );
      }
      function bidirectionalIndexOf(buffer, value, byteOffset, encoding, first) {
        if (buffer.byteLength === 0) return -1;
        if (typeof byteOffset === "string") {
          encoding = byteOffset;
          byteOffset = 0;
        } else if (byteOffset === void 0) {
          byteOffset = first ? 0 : buffer.length - 1;
        } else if (byteOffset < 0) {
          byteOffset += buffer.byteLength;
        }
        if (byteOffset >= buffer.byteLength) {
          if (first) return -1;
          else byteOffset = buffer.byteLength - 1;
        } else if (byteOffset < 0) {
          if (first) byteOffset = 0;
          else return -1;
        }
        if (typeof value === "string") {
          value = from(value, encoding);
        } else if (typeof value === "number") {
          value = value & 255;
          if (first) {
            return buffer.indexOf(value, byteOffset);
          } else {
            return buffer.lastIndexOf(value, byteOffset);
          }
        }
        if (value.byteLength === 0) return -1;
        if (first) {
          let foundIndex = -1;
          for (let i = byteOffset; i < buffer.byteLength; i++) {
            if (buffer[i] === value[foundIndex === -1 ? 0 : i - foundIndex]) {
              if (foundIndex === -1) foundIndex = i;
              if (i - foundIndex + 1 === value.byteLength) return foundIndex;
            } else {
              if (foundIndex !== -1) i -= i - foundIndex;
              foundIndex = -1;
            }
          }
        } else {
          if (byteOffset + value.byteLength > buffer.byteLength) {
            byteOffset = buffer.byteLength - value.byteLength;
          }
          for (let i = byteOffset; i >= 0; i--) {
            let found = true;
            for (let j = 0; j < value.byteLength; j++) {
              if (buffer[i + j] !== value[j]) {
                found = false;
                break;
              }
            }
            if (found) return i;
          }
        }
        return -1;
      }
      function swap(buffer, n, m) {
        const i = buffer[n];
        buffer[n] = buffer[m];
        buffer[m] = i;
      }
      function swap16(buffer) {
        const len = buffer.byteLength;
        if (len % 2 !== 0) {
          throw new RangeError("Buffer size must be a multiple of 16-bits");
        }
        for (let i = 0; i < len; i += 2) swap(buffer, i, i + 1);
        return buffer;
      }
      function swap32(buffer) {
        const len = buffer.byteLength;
        if (len % 4 !== 0) {
          throw new RangeError("Buffer size must be a multiple of 32-bits");
        }
        for (let i = 0; i < len; i += 4) {
          swap(buffer, i, i + 3);
          swap(buffer, i + 1, i + 2);
        }
        return buffer;
      }
      function swap64(buffer) {
        const len = buffer.byteLength;
        if (len % 8 !== 0) {
          throw new RangeError("Buffer size must be a multiple of 64-bits");
        }
        for (let i = 0; i < len; i += 8) {
          swap(buffer, i, i + 7);
          swap(buffer, i + 1, i + 6);
          swap(buffer, i + 2, i + 5);
          swap(buffer, i + 3, i + 4);
        }
        return buffer;
      }
      function toBuffer(buffer) {
        return buffer;
      }
      function toString(buffer, encoding = "utf8", start2 = 0, end = buffer.byteLength) {
        if (arguments.length === 1) return utf82.toString(buffer);
        if (arguments.length === 2) return codecFor(encoding).toString(buffer);
        if (start2 < 0) start2 = 0;
        if (start2 >= buffer.byteLength) return "";
        if (end <= start2) return "";
        if (end > buffer.byteLength) end = buffer.byteLength;
        if (start2 !== 0 || end !== buffer.byteLength) {
          buffer = buffer.subarray(start2, end);
        }
        return codecFor(encoding).toString(buffer);
      }
      function toHex2(buffer, start2, end) {
        return toString(buffer, "hex", start2, end);
      }
      function write(buffer, string, offset = 0, length = buffer.byteLength, encoding) {
        if (arguments.length === 2) return utf82.write(buffer, string);
        if (typeof offset === "string") {
          encoding = offset;
          offset = 0;
          length = buffer.byteLength;
        } else if (typeof length === "string") {
          encoding = length;
          length = buffer.byteLength - offset;
        }
        length = Math.min(length, exports.byteLength(string, encoding));
        let start2 = offset;
        if (start2 < 0) start2 = 0;
        if (start2 >= buffer.byteLength) return 0;
        let end = offset + length;
        if (end <= start2) return 0;
        if (end > buffer.byteLength) end = buffer.byteLength;
        if (start2 !== 0 || end !== buffer.byteLength) {
          buffer = buffer.subarray(start2, end);
        }
        return codecFor(encoding).write(buffer, string);
      }
      function readDoubleBE(buffer, offset = 0) {
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        return view.getFloat64(offset, false);
      }
      function readDoubleLE(buffer, offset = 0) {
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        return view.getFloat64(offset, true);
      }
      function readFloatBE(buffer, offset = 0) {
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        return view.getFloat32(offset, false);
      }
      function readFloatLE(buffer, offset = 0) {
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        return view.getFloat32(offset, true);
      }
      function readInt32BE(buffer, offset = 0) {
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        return view.getInt32(offset, false);
      }
      function readInt32LE(buffer, offset = 0) {
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        return view.getInt32(offset, true);
      }
      function readUInt32BE(buffer, offset = 0) {
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        return view.getUint32(offset, false);
      }
      function readUInt32LE(buffer, offset = 0) {
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        return view.getUint32(offset, true);
      }
      function writeDoubleBE(buffer, value, offset = 0) {
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        view.setFloat64(offset, value, false);
        return offset + 8;
      }
      function writeDoubleLE(buffer, value, offset = 0) {
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        view.setFloat64(offset, value, true);
        return offset + 8;
      }
      function writeFloatBE(buffer, value, offset = 0) {
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        view.setFloat32(offset, value, false);
        return offset + 4;
      }
      function writeFloatLE(buffer, value, offset = 0) {
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        view.setFloat32(offset, value, true);
        return offset + 4;
      }
      function writeInt32BE(buffer, value, offset = 0) {
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        view.setInt32(offset, value, false);
        return offset + 4;
      }
      function writeInt32LE(buffer, value, offset = 0) {
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        view.setInt32(offset, value, true);
        return offset + 4;
      }
      function writeUInt32BE(buffer, value, offset = 0) {
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        view.setUint32(offset, value, false);
        return offset + 4;
      }
      function writeUInt32LE(buffer, value, offset = 0) {
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        view.setUint32(offset, value, true);
        return offset + 4;
      }
      module.exports = exports = {
        isBuffer,
        isEncoding,
        alloc,
        allocUnsafe,
        allocUnsafeSlow,
        byteLength,
        compare,
        concat: concat2,
        copy,
        equals,
        fill,
        from,
        includes,
        indexOf,
        lastIndexOf,
        swap16,
        swap32,
        swap64,
        toBuffer,
        toString,
        toHex: toHex2,
        write,
        readDoubleBE,
        readDoubleLE,
        readFloatBE,
        readFloatLE,
        readInt32BE,
        readInt32LE,
        readUInt32BE,
        readUInt32LE,
        writeDoubleBE,
        writeDoubleLE,
        writeFloatBE,
        writeFloatLE,
        writeInt32BE,
        writeInt32LE,
        writeUInt32BE,
        writeUInt32LE
      };
    }
  });

  // node_modules/@noble/hashes/_u64.js
  function add(Ah, Al, Bh, Bl) {
    const l = (Al >>> 0) + (Bl >>> 0);
    return { h: Ah + Bh + (l / 2 ** 32 | 0) | 0, l: l | 0 };
  }
  var fromNumH, fromNumL, rotrSH, rotrSL, rotrBH, rotrBL, rotr32H, rotr32L, add3L, add3H;
  var init_u64 = __esm({
    "node_modules/@noble/hashes/_u64.js"() {
      fromNumH = (n) => n / 2 ** 32 | 0;
      fromNumL = (n) => n >>> 0;
      rotrSH = (h, l, s) => h >>> s | l << 32 - s;
      rotrSL = (h, l, s) => h << 32 - s | l >>> s;
      rotrBH = (h, l, s) => h << 64 - s | l >>> s - 32;
      rotrBL = (h, l, s) => h >>> s - 32 | l << 64 - s;
      rotr32H = (_h, l) => l;
      rotr32L = (h, _l) => h;
      add3L = (Al, Bl, Cl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0);
      add3H = (low, Ah, Bh, Ch) => Ah + Bh + Ch + (low / 2 ** 32 | 0) | 0;
    }
  });

  // node_modules/@noble/hashes/utils.js
  function isBytes(a) {
    return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in a && a.BYTES_PER_ELEMENT === 1;
  }
  function anumber(n, title = "") {
    if (typeof n !== "number")
      throw new TypeError(atitle(title) + "expected number, got " + typeof n);
    if (!Number.isSafeInteger(n) || n < 0)
      throw new RangeError(atitle(title) + "expected integer >= 0, got " + n);
    return n;
  }
  function abytes(value, length, title = "") {
    if (isBytes(value) && (length === void 0 || value.length === length))
      return value;
    if (length !== void 0)
      anumber(length, "length");
    const bytes2 = isBytes(value);
    const ofLen = length !== void 0 ? ` of length ${length}` : "";
    const got = bytes2 ? `length=${value.length}` : `type=${typeof value}`;
    const message = atitle(title) + "expected Uint8Array" + ofLen + ", got " + got;
    if (!bytes2)
      throw new TypeError(message);
    throw new RangeError(message);
  }
  function copyBytes(bytes2) {
    return Uint8Array.from(abytes(bytes2));
  }
  function aexists(instance, checkFinished = true) {
    if (instance.destroyed)
      throw new Error("hash was destroyed");
    if (checkFinished && instance.finished)
      throw new Error("digest() was already called");
  }
  function aoutput(out, instance) {
    abytes(out, void 0, "output");
    const min = instance.outputLen;
    if (!(out.length >= min)) {
      throw new RangeError('"output" expected length >= ' + min);
    }
  }
  function u32(arr) {
    return new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
  }
  function clean(...arrays) {
    for (let i = 0; i < arrays.length; i++) {
      arrays[i].fill(0);
    }
  }
  function byteSwap(word) {
    return word << 24 & 4278190080 | word << 8 & 16711680 | word >>> 8 & 65280 | word >>> 24 & 255;
  }
  function byteSwap32(arr) {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = byteSwap(arr[i]);
    }
    return arr;
  }
  function bytesToHex(bytes2) {
    abytes(bytes2);
    if (hasHexBuiltin)
      return bytes2.toHex();
    let hex = "";
    for (let i = 0; i < bytes2.length; i++) {
      hex += hexes[bytes2[i]];
    }
    return hex;
  }
  function asciiToBase16(ch) {
    return ch >= 48 && ch <= 57 ? ch - 48 : ch >= 65 && ch <= 70 ? ch - (65 - 10) : ch >= 97 && ch <= 102 ? ch - (97 - 10) : void 0;
  }
  function hexToBytes(hex) {
    if (typeof hex !== "string")
      throw new TypeError("hex string expected, got " + typeof hex);
    if (hasHexBuiltin) {
      try {
        return Uint8Array.fromHex(hex);
      } catch (error) {
        if (error instanceof SyntaxError)
          throw new RangeError(error.message);
        throw error;
      }
    }
    const hl = hex.length;
    const al = hl / 2;
    if (hl % 2)
      throw new RangeError("hex string expected, got unpadded hex of length " + hl);
    const array = new Uint8Array(al);
    for (let ai = 0, hi = 0; ai < al; ai++, hi += 2) {
      const n1 = asciiToBase16(hex.charCodeAt(hi));
      const n2 = asciiToBase16(hex.charCodeAt(hi + 1));
      if (n1 === void 0 || n2 === void 0) {
        const char = hex[hi] + hex[hi + 1];
        throw new RangeError('hex string expected, got non-hex character "' + char + '" at index ' + hi);
      }
      array[ai] = n1 * 16 + n2;
    }
    return array;
  }
  function checkOpts(defaults, opts, title = "opts") {
    aopts(defaults, "defaults");
    if (opts !== void 0)
      aopts(opts, title);
    const merged = Object.assign(/* @__PURE__ */ Object.create(null), defaults, opts);
    return merged;
  }
  function createHasher(hashCons, info = {}) {
    if (typeof hashCons !== "function")
      throw new TypeError('"hashCons" expected function, got type=' + typeof hashCons);
    info = checkOpts({}, info, "info");
    const hashC = (msg, opts) => hashCons(opts).update(msg).digest();
    const tmp = hashCons(void 0);
    hashC.outputLen = tmp.outputLen;
    hashC.blockLen = tmp.blockLen;
    hashC.canXOF = tmp.canXOF;
    hashC.create = (opts) => hashCons(opts);
    Object.assign(hashC, info);
    return Object.freeze(hashC);
  }
  function randomBytes(bytesLength = 32) {
    anumber(bytesLength, "bytesLength");
    const cr = typeof globalThis === "object" ? globalThis.crypto : null;
    if (typeof cr?.getRandomValues !== "function")
      throw new Error("crypto.getRandomValues must be defined");
    if (bytesLength > 65536)
      throw new RangeError(`"bytesLength" expected <= 65536, got ${bytesLength}`);
    return cr.getRandomValues(new Uint8Array(bytesLength));
  }
  var atitle, aobject, aopts, isLE, swap8IfBE, swap32IfBE, hasHexBuiltin, hexes;
  var init_utils = __esm({
    "node_modules/@noble/hashes/utils.js"() {
      atitle = (title) => title ? `"${title}" ` : "";
      aobject = (value, label) => {
        if (value === null || typeof value !== "object" || Array.isArray(value))
          throw new TypeError((label === "object" ? "" : `"${label}" `) + "expected object, got type=" + typeof value);
      };
      aopts = (value, label) => {
        aobject(value, label);
        const proto = Object.getPrototypeOf(value);
        if (proto !== Object.prototype && proto !== null)
          throw new TypeError(`"${label}" expected plain object`);
        if (Object.hasOwn(value, "__proto__"))
          throw new TypeError(`"${label}.__proto__" is not allowed`);
      };
      isLE = /* @__PURE__ */ (() => new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68)();
      swap8IfBE = isLE ? (n) => n : (n) => byteSwap(n) >>> 0;
      swap32IfBE = isLE ? (u) => u : byteSwap32;
      hasHexBuiltin = /* @__PURE__ */ (() => (
        // @ts-ignore
        typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function"
      ))();
      hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
    }
  });

  // node_modules/@noble/curves/utils.js
  function aarray(item, title, inner = () => {
  }) {
    if (!Array.isArray(item))
      throw new TypeError(`"${title}" expected array, got type=${typeof item}`);
    for (let i = 0; i < item.length; i++)
      inner(item[i], `${title}[${i}]`);
    return item;
  }
  function aobject2(value, title = "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value))
      throw new TypeError(title === "object" ? "expected valid options object" : `"${title}" expected object, got type=${typeof value}`);
    return value;
  }
  function afunction(value, title) {
    if (typeof value !== "function")
      throw new TypeError(`"${title}" is invalid: expected function, got ${typeof value}`);
    return value;
  }
  function abool(value, title = "") {
    if (typeof value !== "boolean")
      throw new TypeError(atitle2(title) + "expected boolean, got type=" + typeof value);
    return value;
  }
  function abignumber(n) {
    if (typeof n === "bigint") {
      if (!isPosBig(n))
        throw new RangeError("positive bigint expected, got " + n);
    } else
      anumber2(n);
    return n;
  }
  function asafenumber(value, title = "") {
    if (typeof value !== "number") {
      const prefix = title && `"${title}" `;
      throw new TypeError(prefix + "expected number, got type=" + typeof value);
    }
    if (!Number.isSafeInteger(value)) {
      const prefix = title && `"${title}" `;
      throw new RangeError(prefix + "expected safe integer, got " + value);
    }
  }
  function hexToNumber(hex) {
    if (typeof hex !== "string")
      throw new TypeError("hex string expected, got " + typeof hex);
    return hex === "" ? _0n : BigInt("0x" + hex);
  }
  function bytesToNumberBE(bytes2) {
    return hexToNumber(bytesToHex(bytes2));
  }
  function bytesToNumberLE(bytes2) {
    return hexToNumber(bytesToHex(copyBytes2(abytes(bytes2)).reverse()));
  }
  function numberToBytesBE(n, len) {
    anumber(len);
    if (len === 0)
      throw new Error("zero output length is invalid");
    n = abignumber(n);
    const expectedLen = len * 2;
    const hex = n.toString(16);
    if (hex.length > expectedLen)
      throw new RangeError("number is too large");
    return hexToBytes(hex.padStart(expectedLen, "0"));
  }
  function numberToBytesLE(n, len) {
    return numberToBytesBE(n, len).reverse();
  }
  function copyBytes2(bytes2) {
    return Uint8Array.from(abytes2(bytes2));
  }
  function isPosBig(n) {
    return typeof n === "bigint" && _0n <= n;
  }
  function inRange(n, min, max) {
    return isPosBig(n) && isPosBig(min) && isPosBig(max) && min <= n && n < max;
  }
  function aInRange(title, n, min, max) {
    if (!inRange(n, min, max))
      throw new RangeError("expected valid " + title + ": " + min + " <= n < " + max + ", got " + n);
  }
  function bitLen(n) {
    if (n < _0n)
      throw new Error("expected non-negative bigint, got " + n);
    return n === _0n ? 0 : n.toString(2).length;
  }
  function validateObject(object, fields = {}, optFields = {}, title = "object") {
    aobject2(object, title);
    aobject2(fields, "fields");
    aobject2(optFields, "optFields");
    function checkField(fieldName, expectedType, isOpt) {
      const label = title === "object" ? `param "${String(fieldName)}"` : `"${title}.${String(fieldName)}"`;
      const val = object[fieldName];
      if (!Object.hasOwn(object, fieldName) && (isOpt ? val !== void 0 : expectedType !== "function")) {
        throw new TypeError(`${label} is invalid: expected own property`);
      }
      if (isOpt && val === void 0)
        return;
      const current = typeof val;
      if (current !== expectedType || val === null)
        throw new TypeError(`${label} is invalid: expected ${expectedType}, got ${current}`);
    }
    const iter = (f, isOpt) => Object.entries(f).forEach(([k, v]) => checkField(k, v, isOpt));
    iter(fields, false);
    iter(optFields, true);
  }
  var abytes2, anumber2, bytesToHex2, hexToBytes2, isBytes2, randomBytes2, _0n, _1n, atitle2, bitMask;
  var init_utils2 = __esm({
    "node_modules/@noble/curves/utils.js"() {
      init_utils();
      /*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
      abytes2 = (value, length, title) => abytes(value, length, title);
      anumber2 = anumber;
      bytesToHex2 = bytesToHex;
      hexToBytes2 = (hex) => hexToBytes(hex);
      isBytes2 = isBytes;
      randomBytes2 = (bytesLength) => randomBytes(bytesLength);
      _0n = /* @__PURE__ */ BigInt(0);
      _1n = /* @__PURE__ */ BigInt(1);
      atitle2 = (title) => title ? `"${title}" ` : "";
      bitMask = (n) => {
        asafenumber(n, "n");
        return (_1n << BigInt(n)) - _1n;
      };
    }
  });

  // node_modules/@noble/curves/abstract/modular.js
  function mod(a, b) {
    if (b <= _0n2)
      throw new Error("mod: expected positive modulus, got " + b);
    const result = a % b;
    return result >= _0n2 ? result : b + result;
  }
  function pow(num, power, modulo) {
    if (modulo <= _1n2)
      throw new Error("pow: expected modulus > 1, got " + modulo);
    if (typeof power !== "bigint")
      throw new TypeError("invalid exponent: expected bigint, got " + typeof power);
    if (power < _0n2)
      throw new Error("invalid exponent, negatives unsupported");
    if (power === _0n2)
      return _1n2;
    if (power === _1n2)
      return num;
    let d = num % modulo;
    if (d < _0n2)
      d += modulo;
    if (power < POW_WINDOWED_MIN) {
      let p2 = _1n2;
      while (power > _0n2) {
        if (power & _1n2)
          p2 = p2 * d % modulo;
        d = d * d % modulo;
        power >>= _1n2;
      }
      return p2;
    }
    const digits = [];
    while (power > _0n2) {
      digits.push(Number(power & _15n));
      power >>= _4n;
    }
    const table = new Array(16);
    table[0] = _1n2;
    table[1] = d;
    for (let i = 2; i < 16; i++)
      table[i] = table[i - 1] * d % modulo;
    let p = table[digits[digits.length - 1]];
    for (let w = digits.length - 2; w >= 0; w--) {
      p = p * p % modulo;
      p = p * p % modulo;
      p = p * p % modulo;
      p = p * p % modulo;
      const digit = digits[w];
      if (digit !== 0)
        p = p * table[digit] % modulo;
    }
    return p;
  }
  function pow2(x, power, modulo) {
    if (modulo <= _1n2)
      throw new Error("pow2: expected modulus > 1, got " + modulo);
    if (power < _0n2)
      throw new Error("pow2: expected non-negative exponent, got " + power);
    let res = x;
    while (power-- > _0n2) {
      res *= res;
      res %= modulo;
    }
    return res;
  }
  function invert(number, modulo) {
    if (number === _0n2)
      throw new Error("invert: expected non-zero number");
    if (modulo <= _1n2)
      throw new Error("invert: expected modulus > 1, got " + modulo);
    let a = mod(number, modulo);
    let b = modulo;
    let x = _0n2, u = _1n2;
    while (a !== _0n2) {
      const q = b / a;
      const r = b - a * q;
      const m = x - u * q;
      b = a, a = r, x = u, u = m;
    }
    const gcd = b;
    if (gcd !== _1n2)
      throw new Error("invert: does not exist");
    return mod(x, modulo);
  }
  function assertIsSquare(Fp, root, n) {
    const F = Fp;
    if (!F.eql(F.sqr(root), n))
      throw new Error("Cannot find square root");
  }
  function aoddModulus(order, fnName) {
    if ((order & _1n2) === _0n2)
      throw new Error(fnName + ": expected odd modulus, got " + order);
  }
  function sqrt3mod4(Fp, n) {
    const F = Fp;
    const p1div4 = (F.ORDER + _1n2) / _4n;
    const root = F.pow(n, p1div4);
    assertIsSquare(F, root, n);
    return root;
  }
  function sqrt5mod8(Fp, n) {
    const F = Fp;
    const p5div8 = (F.ORDER - _5n) / _8n;
    const n2 = F.mul(n, _2n);
    const v = F.pow(n2, p5div8);
    const nv = F.mul(n, v);
    const i = F.mul(F.mul(nv, _2n), v);
    const root = F.mul(nv, F.sub(i, F.ONE));
    assertIsSquare(F, root, n);
    return root;
  }
  function sqrt9mod16(P) {
    const Fp_ = Field(P);
    const tn = tonelliShanks(P);
    const c1 = tn(Fp_, Fp_.neg(Fp_.ONE));
    const c2 = tn(Fp_, c1);
    const c3 = tn(Fp_, Fp_.neg(c1));
    const c4 = (P + _7n) / _16n;
    return ((Fp, n) => {
      const F = Fp;
      let tv1 = F.pow(n, c4);
      let tv2 = F.mul(tv1, c1);
      const tv3 = F.mul(tv1, c2);
      const tv4 = F.mul(tv1, c3);
      const e1 = F.eql(F.sqr(tv2), n);
      const e2 = F.eql(F.sqr(tv3), n);
      tv1 = F.cmov(tv1, tv2, e1);
      tv2 = F.cmov(tv4, tv3, e2);
      const e3 = F.eql(F.sqr(tv2), n);
      const root = F.cmov(tv1, tv2, e3);
      assertIsSquare(F, root, n);
      return root;
    });
  }
  function tonelliShanks(P) {
    if (P < _3n)
      throw new Error("sqrt is not defined for small field");
    aoddModulus(P, "tonelliShanks");
    let Q = P - _1n2;
    let S = 0;
    while (Q % _2n === _0n2) {
      Q /= _2n;
      S++;
    }
    let Z = _2n;
    const _Fp = Field(P);
    while (FpLegendre(_Fp, Z) === 1) {
      if (Z++ > 1e3)
        throw new Error("Cannot find square root: probably non-prime P");
    }
    if (S === 1)
      return sqrt3mod4;
    let cc = _Fp.pow(Z, Q);
    const Q1div2 = (Q + _1n2) / _2n;
    return function tonelliSlow(Fp, n) {
      const F = Fp;
      if (F.is0(n))
        return n;
      if (FpLegendre(F, n) !== 1)
        throw new Error("Cannot find square root");
      let M = S;
      let c = F.mul(F.ONE, cc);
      let t = F.pow(n, Q);
      let R = F.pow(n, Q1div2);
      while (!F.eql(t, F.ONE)) {
        if (F.is0(t))
          throw new Error("Cannot find square root: probably non-prime P");
        let i = 1;
        let t_tmp = F.sqr(t);
        while (!F.eql(t_tmp, F.ONE)) {
          i++;
          t_tmp = F.sqr(t_tmp);
          if (i === M)
            throw new Error("Cannot find square root");
        }
        const exponent = _1n2 << BigInt(M - i - 1);
        const b = F.pow(c, exponent);
        M = i;
        c = F.sqr(b);
        t = F.mul(t, c);
        R = F.mul(R, b);
      }
      return R;
    };
  }
  function FpSqrt(P) {
    aoddModulus(P, "Fp.sqrt");
    if (P % _4n === _3n)
      return sqrt3mod4;
    if (P % _8n === _5n)
      return sqrt5mod8;
    if (P % _16n === _9n)
      return sqrt9mod16(P);
    return tonelliShanks(P);
  }
  function validateField(field) {
    aobject2(field, "field");
    if (typeof field.ORDER !== "bigint")
      throw new TypeError('param "ORDER" is invalid: expected bigint, got ' + typeof field.ORDER);
    asafenumber(field.BYTES, "BYTES");
    asafenumber(field.BITS, "BITS");
    for (const name of FIELD_FIELDS)
      afunction(field[name], "field." + name);
    if (field.BYTES < 1 || field.BITS < 1)
      throw new Error("invalid field: expected BYTES/BITS > 0");
    if (field.ORDER <= _1n2)
      throw new Error("invalid field: expected ORDER > 1, got " + field.ORDER);
    return field;
  }
  function FpInvertBatch(Fp, nums, passZero = false) {
    validateField(Fp);
    aarray(nums, "nums");
    abool(passZero, "passZero");
    const F = Fp;
    const inverted = new Array(nums.length).fill(passZero ? F.ZERO : void 0);
    const multipliedAcc = nums.reduce((acc, num, i) => {
      if (F.is0(num))
        return acc;
      inverted[i] = acc;
      return F.mul(acc, num);
    }, F.ONE);
    const invertedAcc = F.inv(multipliedAcc);
    nums.reduceRight((acc, num, i) => {
      if (F.is0(num))
        return acc;
      inverted[i] = F.mul(acc, inverted[i]);
      return F.mul(acc, num);
    }, invertedAcc);
    return inverted;
  }
  function FpLegendre(Fp, n) {
    validateField(Fp);
    const F = Fp;
    aoddModulus(F.ORDER, "FpLegendre");
    const p1mod2 = (F.ORDER - _1n2) / _2n;
    const powered = F.pow(n, p1mod2);
    const yes = F.eql(powered, F.ONE);
    const zero = F.eql(powered, F.ZERO);
    const no = F.eql(powered, F.neg(F.ONE));
    if (!yes && !zero && !no)
      throw new Error("invalid Legendre symbol result");
    return yes ? 1 : zero ? 0 : -1;
  }
  function nLength(n, nBitLength) {
    if (nBitLength !== void 0)
      anumber2(nBitLength);
    if (n <= _0n2)
      throw new Error("invalid n length: expected positive n, got " + n);
    if (nBitLength !== void 0 && nBitLength < 1)
      throw new Error("invalid n length: expected positive bit length, got " + nBitLength);
    const bits = bitLen(n);
    if (nBitLength !== void 0 && nBitLength < bits)
      throw new Error(`invalid n length: expected nBitLength (${nBitLength}) >= bitLen(n) (${bits})`);
    const _nBitLength = nBitLength !== void 0 ? nBitLength : bits;
    const nByteLength = Math.ceil(_nBitLength / 8);
    return { nBitLength: _nBitLength, nByteLength };
  }
  function Field(ORDER, opts = {}) {
    Object.freeze(_Field.prototype);
    return new _Field(ORDER, opts);
  }
  var _0n2, _1n2, _2n, _3n, _4n, _5n, _7n, _8n, _9n, _15n, _16n, POW_WINDOWED_MIN, isNegativeLE, FIELD_FIELDS, FIELD_SQRT, _Field;
  var init_modular = __esm({
    "node_modules/@noble/curves/abstract/modular.js"() {
      init_utils2();
      /*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
      _0n2 = /* @__PURE__ */ BigInt(0);
      _1n2 = /* @__PURE__ */ BigInt(1);
      _2n = /* @__PURE__ */ BigInt(2);
      _3n = /* @__PURE__ */ BigInt(3);
      _4n = /* @__PURE__ */ BigInt(4);
      _5n = /* @__PURE__ */ BigInt(5);
      _7n = /* @__PURE__ */ BigInt(7);
      _8n = /* @__PURE__ */ BigInt(8);
      _9n = /* @__PURE__ */ BigInt(9);
      _15n = /* @__PURE__ */ BigInt(15);
      _16n = /* @__PURE__ */ BigInt(16);
      POW_WINDOWED_MIN = /* @__PURE__ */ BigInt("0x10000000000000000");
      isNegativeLE = (num, modulo) => (mod(num, modulo) & _1n2) === _1n2;
      FIELD_FIELDS = [
        "create",
        "isValid",
        "is0",
        "neg",
        "inv",
        "sqrt",
        "sqr",
        "eql",
        "add",
        "sub",
        "mul",
        "pow",
        "div",
        "addN",
        "subN",
        "mulN",
        "sqrN"
      ];
      FIELD_SQRT = /* @__PURE__ */ new WeakMap();
      _Field = class {
        ORDER;
        BITS;
        BYTES;
        isLE;
        ZERO = _0n2;
        ONE = _1n2;
        _lengths;
        _mod;
        constructor(ORDER, opts = {}) {
          if (ORDER <= _1n2)
            throw new Error("invalid field: expected ORDER > 1, got " + ORDER);
          let _nbitLength = void 0;
          this.isLE = false;
          if (opts != null && typeof opts === "object") {
            if (typeof opts.BITS === "number")
              _nbitLength = opts.BITS;
            if (typeof opts.sqrt === "function")
              Object.defineProperty(this, "sqrt", { value: opts.sqrt, enumerable: true });
            if (typeof opts.isLE === "boolean")
              this.isLE = opts.isLE;
            if (opts.allowedLengths)
              this._lengths = Object.freeze(opts.allowedLengths.slice());
            if (typeof opts.modFromBytes === "boolean")
              this._mod = opts.modFromBytes;
          }
          const { nBitLength, nByteLength } = nLength(ORDER, _nbitLength);
          if (nByteLength > 2048)
            throw new Error("invalid field: expected ORDER of <= 2048 bytes");
          this.ORDER = ORDER;
          this.BITS = nBitLength;
          this.BYTES = nByteLength;
          Object.freeze(this);
        }
        create(num) {
          return mod(num, this.ORDER);
        }
        isValid(num) {
          if (typeof num !== "bigint")
            throw new TypeError("invalid field element: expected bigint, got " + typeof num);
          return _0n2 <= num && num < this.ORDER;
        }
        is0(num) {
          return num === _0n2;
        }
        // is valid and invertible
        isValidNot0(num) {
          return !this.is0(num) && this.isValid(num);
        }
        isOdd(num) {
          return (num & _1n2) === _1n2;
        }
        neg(num) {
          return mod(-num, this.ORDER);
        }
        eql(lhs, rhs) {
          return lhs === rhs;
        }
        sqr(num) {
          return mod(num * num, this.ORDER);
        }
        add(lhs, rhs) {
          return mod(lhs + rhs, this.ORDER);
        }
        sub(lhs, rhs) {
          return mod(lhs - rhs, this.ORDER);
        }
        mul(lhs, rhs) {
          return mod(lhs * rhs, this.ORDER);
        }
        pow(num, power) {
          return pow(num, power, this.ORDER);
        }
        div(lhs, rhs) {
          return mod(lhs * invert(rhs, this.ORDER), this.ORDER);
        }
        // Same as above, but doesn't normalize
        sqrN(num) {
          return num * num;
        }
        addN(lhs, rhs) {
          return lhs + rhs;
        }
        subN(lhs, rhs) {
          return lhs - rhs;
        }
        mulN(lhs, rhs) {
          return lhs * rhs;
        }
        inv(num) {
          return invert(num, this.ORDER);
        }
        sqrt(num) {
          let sqrt = FIELD_SQRT.get(this);
          if (!sqrt)
            FIELD_SQRT.set(this, sqrt = FpSqrt(this.ORDER));
          return sqrt(this, num);
        }
        toBytes(num) {
          return this.isLE ? numberToBytesLE(num, this.BYTES) : numberToBytesBE(num, this.BYTES);
        }
        fromBytes(bytes2, skipValidation = false) {
          abytes2(bytes2);
          const { _lengths: allowedLengths, BYTES, isLE: isLE3, ORDER, _mod: modFromBytes } = this;
          if (allowedLengths) {
            if (bytes2.length < 1 || !allowedLengths.includes(bytes2.length) || bytes2.length > BYTES) {
              throw new Error("Field.fromBytes: expected " + allowedLengths + " bytes, got " + bytes2.length);
            }
            const padded = new Uint8Array(BYTES);
            padded.set(bytes2, isLE3 ? 0 : padded.length - bytes2.length);
            bytes2 = padded;
          }
          if (bytes2.length !== BYTES)
            throw new Error("Field.fromBytes: expected " + BYTES + " bytes, got " + bytes2.length);
          let scalar = isLE3 ? bytesToNumberLE(bytes2) : bytesToNumberBE(bytes2);
          if (modFromBytes)
            scalar = mod(scalar, ORDER);
          if (!skipValidation) {
            if (!this.isValid(scalar))
              throw new Error("invalid field element: outside of range 0..ORDER");
          }
          return scalar;
        }
        // TODO: we don't need it here, move out to separate fn
        invertBatch(lst) {
          return FpInvertBatch(this, lst, true);
        }
        // We can't move this out because Fp6, Fp12 implement it
        // and it's unclear what to return in there.
        cmov(a, b, condition) {
          abool(condition, "condition");
          return condition ? b : a;
        }
      };
    }
  });

  // node_modules/@noble/curves/abstract/curve.js
  function validatePointCons(Point) {
    const pc = Point;
    if (typeof pc !== "function")
      throw new TypeError('"Point" expected constructor, got type=' + typeof Point);
    afunction(pc.fromAffine, "Point.fromAffine");
    afunction(pc.fromBytes, "Point.fromBytes");
    afunction(pc.fromHex, "Point.fromHex");
    aobject2(pc.BASE, "Point.BASE");
    aobject2(pc.ZERO, "Point.ZERO");
    validateField(pc.Fp);
    validateField(pc.Fn);
  }
  function normalizeZ(c, points) {
    validatePointCons(c);
    validateMSMPoints(points, c);
    const invertedZs = FpInvertBatch(c.Fp, points.map((p) => p.Z));
    return points.map((p, i) => c.fromAffine(p.toAffine(invertedZs[i])));
  }
  function validateW(W, bits, min = 1) {
    if (!Number.isSafeInteger(W) || W < min || W > bits)
      throw new Error("invalid window size, expected [" + min + ".." + bits + "], got W=" + W);
  }
  function validateTableBytes(numPoints, fpBytes) {
    const bytes2 = numPoints * (4 * fpBytes + 128);
    if (bytes2 > TABLE_BYTES_MAX)
      throw new Error("invalid window size: table would need ~" + Math.ceil(bytes2 / 2 ** 20) + " MiB, max " + TABLE_BYTES_MAX / 2 ** 20 + " MiB");
  }
  function probeRandomBytes(randomBytes5, length) {
    if (randomBytes5 === void 0)
      return void 0;
    afunction(randomBytes5, "randomBytes");
    try {
      const probe = randomBytes5(length);
      if (!isBytes2(probe) || probe.length !== length)
        return void 0;
    } catch {
      return void 0;
    }
    return randomBytes5;
  }
  function validateMSMPoints(points, c) {
    aarray(points, "points");
    points.forEach((p, i) => {
      if (!(p instanceof c))
        throw new Error("invalid point at index " + i);
    });
  }
  function validateMSMScalars(scalars, field, maxScalar) {
    if (!Array.isArray(scalars))
      throw new Error("array of scalars expected");
    scalars.forEach((s, i) => {
      const ok = maxScalar === void 0 ? field.isValid(s) : isPosBig(s) && s < maxScalar;
      if (!ok)
        throw new Error("invalid scalar at index " + i);
    });
  }
  function getWindowSize(P) {
    return pointWindowSizes.get(P) || 1;
  }
  function oddMultiples(p, size) {
    const dbl = p.double();
    const t = [p];
    for (let j = 1; j < size; j++)
      t.push(t[j - 1].add(dbl));
    return t;
  }
  function wnafDigits(n, W) {
    const size = 2 ** W;
    const half = size / 2;
    const mask = BigInt(size - 1);
    const d = [];
    while (n > _0n3) {
      let w = 0;
      if (n & _1n3) {
        w = Number(n & mask);
        if (w >= half)
          w -= size;
        n -= BigInt(w);
      }
      d.push(w);
      n >>= _1n3;
    }
    return d;
  }
  function signedWindowDigits(n, W, windows) {
    const size = 2 ** W;
    const half = size / 2;
    const mask = BigInt(size - 1);
    const shiftBy = BigInt(W);
    const d = [];
    for (let w = 0; w < windows; w++) {
      let v = Number(n & mask);
      n >>= shiftBy;
      if (v > half) {
        v -= size;
        n += _1n3;
      }
      d.push(v);
    }
    if (n !== _0n3)
      throw new Error("invalid wnaf");
    return d;
  }
  function wnafWalk(zero, tables, digits) {
    let max = 0;
    for (const d of digits)
      max = Math.max(max, d.length);
    let acc = zero;
    for (let bit = max - 1; bit >= 0; bit--) {
      if (bit !== max - 1)
        acc = acc.double();
      for (let i = 0; i < digits.length; i++) {
        const w = digits[i][bit];
        if (w) {
          const item = tables[i][Math.abs(w) - 1 >> 1];
          acc = acc.add(w < 0 ? item.negate() : item);
        }
      }
    }
    return acc;
  }
  function mulAddUnsafe(c, points, scalars, allowOversized = false) {
    validatePointCons(c);
    validateMSMPoints(points, c);
    abool(allowOversized, "allowOversized");
    validateMSMScalars(scalars, c.Fn, allowOversized ? c.Fn.ORDER ** _4n2 : void 0);
    if (points.length !== scalars.length)
      throw new Error("arrays of points and scalars must have equal length");
    const tables = points.map((p) => oddMultiples(p, 4));
    const digits = scalars.map((n) => wnafDigits(n, 4));
    return wnafWalk(c.ZERO, tables, digits);
  }
  function createField(order, field, isLE3) {
    if (field) {
      if (field.ORDER !== order)
        throw new Error("Field.ORDER must match order: Fp == p, Fn == n");
      validateField(field);
      return field;
    } else {
      return Field(order, { isLE: isLE3 });
    }
  }
  function createCurveFields(type, CURVE, curveOpts = {}, FpFnLE) {
    if (type !== "weierstrass" && type !== "edwards")
      throw new Error('expected curve type "weierstrass" or "edwards"');
    if (FpFnLE === void 0)
      FpFnLE = type === "edwards";
    if (!CURVE || typeof CURVE !== "object")
      throw new Error(`expected valid ${type} CURVE object`);
    validateObject(curveOpts);
    for (const p of ["p", "n", "h"]) {
      const val = CURVE[p];
      if (!(isPosBig(val) && val !== _0n3))
        throw new Error(`CURVE.${p} must be positive bigint`);
    }
    const Fp = createField(CURVE.p, curveOpts.Fp, FpFnLE);
    const Fn = createField(CURVE.n, curveOpts.Fn, FpFnLE);
    const _b = type === "weierstrass" ? "b" : "d";
    const params = ["Gx", "Gy", "a", _b];
    for (const p of params) {
      if (!Fp.isValid(CURVE[p]))
        throw new Error(`CURVE.${p} must be valid field element of CURVE.Fp`);
    }
    CURVE = Object.freeze(Object.assign({}, CURVE));
    return { CURVE, Fp, Fn };
  }
  function createKeygen(randomSecretKey, getPublicKey) {
    return function keygen(seed) {
      const secretKey = randomSecretKey(seed);
      return { secretKey, publicKey: getPublicKey(secretKey) };
    };
  }
  var _0n3, _1n3, _4n2, BLIND_BYTES, BLIND_BITS, FW_WINDOW, TABLE_BYTES_MAX, pointWindowSizes, ScalarMultiplier;
  var init_curve = __esm({
    "node_modules/@noble/curves/abstract/curve.js"() {
      init_utils2();
      init_modular();
      /*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
      _0n3 = /* @__PURE__ */ BigInt(0);
      _1n3 = /* @__PURE__ */ BigInt(1);
      _4n2 = /* @__PURE__ */ BigInt(4);
      BLIND_BYTES = 16;
      BLIND_BITS = 128;
      FW_WINDOW = 5;
      TABLE_BYTES_MAX = /* @__PURE__ */ (() => 2 ** 31)();
      pointWindowSizes = /* @__PURE__ */ new WeakMap();
      ScalarMultiplier = class {
        Point;
        BASE;
        ZERO;
        randomBytes;
        wnafPrecomputes = /* @__PURE__ */ new WeakMap();
        baseCanBeBlinded;
        bits;
        // Parametrized with a given Point class (not individual point)
        constructor(Point, randomBytes5) {
          validatePointCons(Point);
          this.randomBytes = probeRandomBytes(randomBytes5, BLIND_BYTES);
          this.Point = Point;
          this.BASE = Point.BASE;
          this.ZERO = Point.ZERO;
          this.bits = Point.Fn.BITS;
        }
        /**
         * Creates a signed fixed-window wNAF precomputation table: for every window w, the
         * multiples `[1..2^(W−1)]⋅2^(w⋅W)⋅P`, flattened. All doublings are baked into the table,
         * so cached multiplication is additions-only. `windows = ceil(bits/W) + 1`: the extra
         * window absorbs the final carry of signed-digit recoding.
         * For a 256-bit curve and W=6, the table is 44⋅32 = 1408 points.
         * @param point - Point instance
         * @param W - window size
         * @param bits - scalar bitlength the table must cover
         */
        buildWnafTable(point, W, bits) {
          const windows = Math.ceil(bits / W) + 1;
          const half = 2 ** (W - 1);
          const comp = [];
          let base = point;
          for (let w = 0; w < windows; w++) {
            let acc = base;
            for (let i = 0; i < half; i++) {
              comp.push(acc);
              acc = acc.add(base);
            }
            base = comp[comp.length - 1].double();
          }
          return { W, bits, windows, comp };
        }
        /**
         * Implements ec multiplication using precomputed signed fixed-window wNAF tables.
         * Constant-time: fixed window count with one table addition per window — zero digits feed
         * the fake accumulator — and no doublings; the lookup scans the whole window slice.
         * Scalar bounds are validated by the public entry points ({@link ScalarMultiplier.mulCT},
         * {@link ScalarMultiplier.mulCTBlinded}, {@link ScalarMultiplier.mulUnsafe});
         * signedWindowDigits throws if `n` exceeds the table.
         * @returns real and fake (for const-time) points
         */
        wnafCachedCT(precomputes, n) {
          const { W, windows, comp } = precomputes;
          const half = 2 ** (W - 1);
          const digits = signedWindowDigits(n, W, windows);
          let p = this.ZERO;
          let f = this.BASE;
          for (let w = 0; w < windows; w++) {
            const digit = digits[w];
            const start2 = w * half;
            const idx = Math.abs(digit) - 1;
            let sel = comp[start2];
            for (let i = 1; i < half; i++)
              sel = i === idx ? comp[start2 + i] : sel;
            const neg = sel.negate();
            if (digit === 0)
              f = f.add(comp[start2]);
            else
              p = p.add(digit < 0 ? neg : sel);
          }
          return { p, f };
        }
        // Cache key is point identity plus (W, bits); at most two entries exist per point (public-width
        // `Fn.BITS` and blinded `Fn.BITS + BLIND_BITS`). Callers must not reuse the same point with
        // incompatible `transform(...)` layouts and expect a separate cache entry.
        getWnafPrecomputes(W, point, bits, transform) {
          let entries = this.wnafPrecomputes.get(point);
          let comp = entries?.find((entry) => entry.W === W && entry.bits === bits);
          if (!comp) {
            comp = this.buildWnafTable(point, W, bits);
            if (typeof transform === "function")
              comp = { ...comp, comp: transform(comp.comp) };
            if (!entries) {
              entries = [];
              this.wnafPrecomputes.set(point, entries);
            }
            entries.push(comp);
          }
          return comp;
        }
        assertPoint(point) {
          if (!(point instanceof this.Point))
            throw new TypeError('"point" expected Point instance, got type=' + typeof point);
        }
        // Shared prologue of the constant-time entry points. Rejects scalar 0: in key/signature-style
        // callers a zero scalar means broken upstream plumbing, and concrete Points already reject it.
        // Uses inRange instead of Fn.isValidNot0: validateField() only certifies the arithmetic subset.
        validateMulInput(point, scalar) {
          this.assertPoint(point);
          if (!inRange(scalar, _1n3, this.Point.Fn.ORDER))
            throw new Error("invalid scalar");
        }
        // Constant-time dispatch shared by mulCT / mulCTBlinded. Un-precomputed points (W===1, e.g.
        // ECDH peer keys) skip building a throwaway cached table in favor of a small fixed-window
        // multiply. `n` must be < 2^bits.
        runCT(point, n, bits, transform) {
          const W = getWindowSize(point);
          if (W === 1)
            return this.fixedWindowCT(point, n, bits);
          return this.wnafCachedCT(this.getWnafPrecomputes(W, point, bits, transform), n);
        }
        mulCT(point, scalar, transform) {
          this.validateMulInput(point, scalar);
          return this.runCT(point, scalar, this.bits, transform);
        }
        mulCTBlinded(point, scalar, transform) {
          this.validateMulInput(point, scalar);
          if (this.randomBytes === void 0)
            throw new Error("randomBytes is required for scalar blinding");
          const bits = this.Point.Fn.BITS + BLIND_BITS;
          const blind = this.randomBytes(BLIND_BYTES);
          if (!isBytes2(blind) || blind.length !== BLIND_BYTES)
            throw new Error("randomBytes returned invalid byte array");
          blind[0] = blind[0] & 63 | 128;
          const n = scalar + bytesToNumberBE(blind) * this.Point.Fn.ORDER;
          return this.runCT(point, n, bits, transform);
        }
        /**
         * Constant-time multiplication `n*point` for an un-precomputed point, via a small fixed window.
         * A cached wNAF table only pays off when reused; a flat 2^FW_WINDOW table (`size-1` adds) is
         * far cheaper to build for a single use. The point-operation sequence is independent of `n`:
         * build the table, then per window exactly FW_WINDOW doublings, a data-oblivious scan over
         * every table entry, and one addition (adds the identity when the window digit is 0 — never
         * skipped).
         *
         * `n` must be `< 2^bits`. Assumes complete addition (adding the identity costs the same as any
         * add), which holds for the Weierstrass/Edwards point types used here. The table is left in
         * projective form (no normalizeZ): normalizing this small a table costs more than the
         * mixed-add savings it would buy for a single multiply.
         * @returns real point `p`; `f` duplicates it only to match {@link wnafCachedCT}'s return shape
         * (this path needs no fake accumulator — its op-count is already scalar-independent).
         */
        fixedWindowCT(point, n, bits) {
          const W = FW_WINDOW;
          const size = 1 << W;
          const mask = bitMask(W);
          const table = new Array(size);
          table[0] = this.ZERO;
          for (let i = 1; i < size; i++)
            table[i] = table[i - 1].add(point);
          const windows = Math.ceil(bits / W);
          let acc = this.ZERO;
          for (let window2 = windows - 1; window2 >= 0; window2--) {
            if (window2 !== windows - 1)
              for (let d = 0; d < W; d++)
                acc = acc.double();
            const digit = Number(n >> BigInt(window2 * W) & mask);
            let sel = table[0];
            for (let i = 1; i < size; i++)
              sel = i === digit ? table[i] : sel;
            acc = acc.add(sel);
          }
          return { p: acc, f: acc };
        }
        shouldBlind(point, cofactor) {
          if (this.randomBytes === void 0)
            return false;
          if (cofactor === _1n3)
            return true;
          if (point !== this.BASE)
            return false;
          if (this.baseCanBeBlinded === void 0)
            this.baseCanBeBlinded = this.mulUnsafe(this.BASE, this.Point.Fn.ORDER).is0();
          return this.baseCanBeBlinded;
        }
        mulSecret(point, scalar, cofactor, transform) {
          return this.shouldBlind(point, cofactor) ? this.mulCTBlinded(point, scalar, transform) : this.mulCT(point, scalar, transform);
        }
        mulUnsafe(point, scalar, transform) {
          this.assertPoint(point);
          if (!isPosBig(scalar))
            throw new Error("invalid scalar");
          const W = getWindowSize(point);
          if (W === 1 || scalar >= this.Point.Fn.ORDER)
            return mulAddUnsafe(this.Point, [point], [scalar], true);
          const precomputes = this.getWnafPrecomputes(W, point, this.bits, transform);
          return this.wnafCachedCT(precomputes, scalar).p;
        }
        // Remembers the window size used for precomputed wNAF multiplication of the given point
        // and drops any previously built tables. Usually only the base point is precomputed.
        // W=1 resets the point to the un-precomputed (table-less) paths.
        // W is additionally capped so tables stay under ~2 GiB ({@link TABLE_BYTES_MAX}).
        setWindowSize(point, W) {
          this.assertPoint(point);
          validateW(W, this.bits);
          const windows = Math.ceil((this.bits + BLIND_BITS) / W) + 1;
          validateTableBytes(windows * 2 ** (W - 1), this.Point.Fp.BYTES);
          pointWindowSizes.set(point, W);
          this.wnafPrecomputes.delete(point);
        }
        // True when a window size is set: tables themselves are built lazily on first multiply.
        hasWindowSize(point) {
          return getWindowSize(point) !== 1;
        }
      };
    }
  });

  // node_modules/@noble/curves/abstract/edwards.js
  function isEdValidXY(Fp, CURVE, x, y) {
    const x2 = Fp.sqr(x);
    const y2 = Fp.sqr(y);
    const left = Fp.add(Fp.mul(CURVE.a, x2), y2);
    const right = Fp.add(Fp.ONE, Fp.mul(CURVE.d, Fp.mul(x2, y2)));
    return Fp.eql(left, right);
  }
  function edwards(params, extraOpts = {}) {
    validateObject(extraOpts, {}, {}, "extraOpts");
    const opts = extraOpts;
    const validated = createCurveFields("edwards", params, opts, opts.FpFnLE);
    const { Fp, Fn } = validated;
    let CURVE = validated.CURVE;
    const { h: cofactor } = CURVE;
    if (FpLegendre(Fp, CURVE.a) !== 1)
      throw new Error("edwards: CURVE.a must be a square in Fp for complete addition formulas");
    if (FpLegendre(Fp, CURVE.d) !== -1)
      throw new Error("edwards: CURVE.d must be a non-square in Fp for complete addition formulas");
    validateObject(opts, {}, { uvRatio: "function", randomBytes: "function" });
    const randomBytes5 = opts.randomBytes === void 0 ? randomBytes2 : opts.randomBytes;
    const MASK = _2n2 << BigInt(Fp.BYTES * 8) - _1n4;
    function isOdd(n) {
      if (!Fp.isOdd)
        throw new Error("Field does not have .isOdd()");
      return Fp.isOdd(n);
    }
    const uvRatio2 = opts.uvRatio === void 0 ? (u, v) => {
      try {
        return { isValid: true, value: Fp.sqrt(Fp.div(u, v)) };
      } catch (e) {
        return { isValid: false, value: _0n4 };
      }
    } : opts.uvRatio;
    if (!isEdValidXY(Fp, CURVE, CURVE.Gx, CURVE.Gy))
      throw new Error("bad curve params: generator point");
    const mulA = Fp.eql(CURVE.a, Fp.neg(Fp.ONE)) ? (x) => Fp.neg(x) : Fp.eql(CURVE.a, Fp.ONE) ? (x) => x : (x) => Fp.mul(CURVE.a, x);
    function acoord(title, n, banZero = false) {
      const min = banZero ? _1n4 : _0n4;
      aInRange("coordinate " + title, n, min, MASK);
      return n;
    }
    function aedpoint(other) {
      if (!(other instanceof Point))
        throw new Error("EdwardsPoint expected");
    }
    class Point {
      static BASE = new Point(CURVE.Gx, CURVE.Gy, Fp.ONE, Fp.mul(CURVE.Gx, CURVE.Gy));
      static ZERO = new Point(Fp.ZERO, Fp.ONE, Fp.ONE, Fp.ZERO);
      static Fp = Fp;
      static Fn = Fn;
      X;
      Y;
      Z;
      T;
      constructor(X, Y, Z, T) {
        this.X = acoord("x", X);
        this.Y = acoord("y", Y);
        this.Z = acoord("z", Z, true);
        this.T = acoord("t", T);
        Object.freeze(this);
      }
      static CURVE() {
        return CURVE;
      }
      /**
       * Create one extended Edwards point from affine coordinates.
       * Does NOT validate that the point is on-curve or torsion-free.
       * Use `.assertValidity()` on adversarial inputs.
       */
      static fromAffine(p) {
        if (p instanceof Point)
          throw new Error("extended point not allowed");
        const { x, y } = p || {};
        acoord("x", x);
        acoord("y", y);
        return new Point(x, y, Fp.ONE, Fp.mul(x, y));
      }
      // Uses algo from RFC8032 5.1.3.
      static fromBytes(bytes2, zip215 = false) {
        const len = Fp.BYTES;
        const { a, d } = CURVE;
        bytes2 = copyBytes2(abytes2(bytes2, len, "point"));
        abool(zip215, "zip215");
        const normed = copyBytes2(bytes2);
        const lastByte = bytes2[len - 1];
        normed[len - 1] = lastByte & ~128;
        const y = bytesToNumberLE(normed);
        const max = zip215 ? MASK : Fp.ORDER;
        aInRange("point.y", y, _0n4, max);
        const y2 = Fp.sqr(y);
        const u = Fp.sub(y2, Fp.ONE);
        const v = Fp.sub(Fp.mulN(d, y2), a);
        let { isValid, value: x } = uvRatio2(u, v);
        if (!isValid)
          throw new Error("bad point: invalid y coordinate");
        const isXOdd = isOdd(x);
        const isLastByteOdd = (lastByte & 128) !== 0;
        if (!zip215 && Fp.is0(x) && isLastByteOdd)
          throw new Error("bad point: x=0 and x_0=1");
        if (isLastByteOdd !== isXOdd)
          x = Fp.neg(x);
        return Point.fromAffine({ x, y });
      }
      static fromHex(hex, zip215 = false) {
        return Point.fromBytes(hexToBytes2(hex), zip215);
      }
      get x() {
        return this.toAffine().x;
      }
      get y() {
        return this.toAffine().y;
      }
      precompute(windowSize = 6, isLazy = true) {
        wnaf.setWindowSize(this, windowSize);
        if (!isLazy)
          this.multiply(_2n2);
        return this;
      }
      // Useful in fromAffine() - not for fromBytes(), which always created valid points.
      assertValidity() {
        const p = this;
        const { a, d } = CURVE;
        if (p.is0())
          throw new Error("bad point: ZERO");
        const { X, Y, Z, T } = p;
        const X2 = Fp.sqr(X);
        const Y2 = Fp.sqr(Y);
        const Z2 = Fp.sqr(Z);
        const Z4 = Fp.sqr(Z2);
        const aX2 = Fp.mul(X2, a);
        const left = Fp.mul(Fp.add(aX2, Y2), Z2);
        const right = Fp.add(Z4, Fp.mul(d, Fp.mul(X2, Y2)));
        if (!Fp.eql(left, right))
          throw new Error("bad point: equation left != right (1)");
        const XY = Fp.mul(X, Y);
        const ZT = Fp.mul(Z, T);
        if (!Fp.eql(XY, ZT))
          throw new Error("bad point: equation left != right (2)");
      }
      // Compare one point to another.
      equals(other) {
        aedpoint(other);
        const { X: X1, Y: Y1, Z: Z1 } = this;
        const { X: X2, Y: Y2, Z: Z2 } = other;
        const X1Z2 = Fp.mul(X1, Z2);
        const X2Z1 = Fp.mul(X2, Z1);
        const Y1Z2 = Fp.mul(Y1, Z2);
        const Y2Z1 = Fp.mul(Y2, Z1);
        return Fp.eql(X1Z2, X2Z1) && Fp.eql(Y1Z2, Y2Z1);
      }
      is0() {
        return this.equals(Point.ZERO);
      }
      negate() {
        return new Point(Fp.neg(this.X), this.Y, this.Z, Fp.neg(this.T));
      }
      // Fast algo for doubling Extended Point.
      // https://hyperelliptic.org/EFD/g1p/auto-twisted-extended.html#doubling-dbl-2008-hwcd
      // Cost: 4M + 4S + 1*a + 6add + 1*2.
      double() {
        const { X: X1, Y: Y1, Z: Z1 } = this;
        const A = Fp.sqr(X1);
        const B = Fp.sqr(Y1);
        const C = Fp.mul(Fp.sqr(Z1), _2n2);
        const D = mulA(A);
        const x1y1 = Fp.addN(X1, Y1);
        const E = Fp.sub(Fp.subN(Fp.sqr(x1y1), A), B);
        const G = Fp.addN(D, B);
        const F = Fp.subN(G, C);
        const H = Fp.subN(D, B);
        const X3 = Fp.mul(E, F);
        const Y3 = Fp.mul(G, H);
        const T3 = Fp.mul(E, H);
        const Z3 = Fp.mul(F, G);
        return new Point(X3, Y3, Z3, T3);
      }
      // Fast algo for adding 2 Extended Points.
      // https://hyperelliptic.org/EFD/g1p/auto-twisted-extended.html#addition-add-2008-hwcd
      // Cost: 9M + 1*a + 1*d + 7add.
      add(other) {
        aedpoint(other);
        const { d } = CURVE;
        const { X: X1, Y: Y1, Z: Z1, T: T1 } = this;
        const { X: X2, Y: Y2, Z: Z2, T: T2 } = other;
        const A = Fp.mul(X1, X2);
        const B = Fp.mul(Y1, Y2);
        const C = Fp.mul(Fp.mulN(T1, d), T2);
        const D = Fp.mul(Z1, Z2);
        const E = Fp.sub(Fp.subN(Fp.mulN(Fp.addN(X1, Y1), Fp.addN(X2, Y2)), A), B);
        const F = Fp.subN(D, C);
        const G = Fp.addN(D, C);
        const H = Fp.sub(B, mulA(A));
        const X3 = Fp.mul(E, F);
        const Y3 = Fp.mul(G, H);
        const T3 = Fp.mul(E, H);
        const Z3 = Fp.mul(F, G);
        return new Point(X3, Y3, Z3, T3);
      }
      subtract(other) {
        aedpoint(other);
        return this.add(other.negate());
      }
      // Constant-time multiplication.
      multiply(scalar) {
        if (!Fn.isValidNot0(scalar))
          throw new RangeError("invalid scalar: expected 1 <= sc < curve.n");
        const { p, f } = wnaf.mulSecret(this, scalar, cofactor, normalize);
        return normalize([p, f])[0];
      }
      // Non-constant-time multiplication. Uses double-and-add algorithm.
      // It's faster, but should only be used when you don't care about
      // an exposed private key e.g. sig verification.
      // Keeps the same subgroup-scalar contract: 0 is allowed for public-scalar callers, but
      // n and larger values are rejected instead of being reduced mod n to the identity point.
      multiplyUnsafe(scalar) {
        if (!Fn.isValid(scalar))
          throw new RangeError("invalid scalar: expected 0 <= sc < curve.n");
        if (scalar === _0n4)
          return Point.ZERO;
        if (this.is0() || scalar === _1n4)
          return this;
        return wnaf.mulUnsafe(this, scalar, normalize);
      }
      // Checks if point is of small order.
      // If you add something to small order point, you will have "dirty"
      // point with torsion component.
      // Clears cofactor and checks if the result is 0.
      isSmallOrder() {
        return this.clearCofactor().is0();
      }
      // Multiplies point by curve order and checks if the result is 0.
      // Returns `false` is the point is dirty.
      isTorsionFree() {
        return wnaf.mulUnsafe(this, CURVE.n).is0();
      }
      // Converts Extended point to default (x, y) coordinates.
      // Can accept precomputed Z^-1 - for example, from invertBatch.
      toAffine(invertedZ) {
        const p = this;
        let iz = invertedZ;
        if (iz != null && typeof iz !== "bigint")
          throw new TypeError('"invertedZ" expected bigint, got type=' + typeof iz);
        const { X, Y, Z } = p;
        const is0 = p.is0();
        if (iz == null)
          iz = is0 ? Fp.create(_8n2) : Fp.inv(Z);
        const x = Fp.mul(X, iz);
        const y = Fp.mul(Y, iz);
        const zz = Fp.mul(Z, iz);
        if (is0)
          return { x: Fp.ZERO, y: Fp.ONE };
        if (!Fp.eql(zz, Fp.ONE))
          throw new Error("invZ was invalid");
        return { x, y };
      }
      clearCofactor() {
        if (cofactor === _1n4)
          return this;
        if (cofactor === _2n2)
          return this.double();
        if (cofactor === _4n3)
          return this.double().double();
        if (cofactor === _8n2)
          return this.double().double().double();
        return this.multiplyUnsafe(cofactor);
      }
      toBytes() {
        const { x, y } = this.toAffine();
        const bytes2 = Fp.toBytes(y);
        bytes2[bytes2.length - 1] |= isOdd(x) ? 128 : 0;
        return bytes2;
      }
      toHex() {
        return bytesToHex2(this.toBytes());
      }
      toString() {
        return `<Point ${this.is0() ? "ZERO" : this.toHex()}>`;
      }
    }
    const normalize = (points) => normalizeZ(Point, points);
    const wnaf = new ScalarMultiplier(Point, randomBytes5);
    if (wnaf.bits >= 6)
      Point.BASE.precompute(6);
    Object.freeze(Point.prototype);
    Object.freeze(Point);
    return Point;
  }
  var _0n4, _1n4, _2n2, _4n3, _8n2;
  var init_edwards = __esm({
    "node_modules/@noble/curves/abstract/edwards.js"() {
      init_utils2();
      init_curve();
      init_modular();
      /*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
      _0n4 = /* @__PURE__ */ BigInt(0);
      _1n4 = /* @__PURE__ */ BigInt(1);
      _2n2 = /* @__PURE__ */ BigInt(2);
      _4n3 = /* @__PURE__ */ BigInt(4);
      _8n2 = /* @__PURE__ */ BigInt(8);
    }
  });

  // node_modules/@noble/curves/abstract/montgomery.js
  function cmask(P, swap) {
    return P + swap - (swap >> _1n5 << _1n5);
  }
  function cswap(P) {
    const offset = BigInt(6) * P;
    return (mask, x_2, x_3) => {
      const sum = x_2 + x_3;
      const d = offset + x_3 - x_2;
      const a = (d * mask + x_2) % P;
      return { x_2: a, x_3: sum - a };
    };
  }
  function validateOpts(curve) {
    validateObject(curve, {
      P: "bigint",
      type: "string",
      adjustScalarBytes: "function",
      powPminus2: "function"
    }, {
      randomBytes: "function",
      scalarMultBase: "function"
    });
    return Object.freeze({ ...curve });
  }
  function montgomery(curveDef) {
    const CURVE = validateOpts(curveDef);
    const { P, type, adjustScalarBytes: adjustScalarBytes2, powPminus2, randomBytes: rand } = CURVE;
    const mulBaseHook = CURVE.scalarMultBase;
    const is25519 = type === "x25519";
    if (!is25519 && type !== "x448")
      throw new Error("invalid type");
    const randomBytes_ = rand === void 0 ? randomBytes2 : rand;
    const montgomeryBits = is25519 ? 255 : 448;
    const swap = cswap(P);
    const fieldLen = is25519 ? 32 : 56;
    const Gu = is25519 ? BigInt(9) : BigInt(5);
    const a24 = is25519 ? BigInt(121665) : BigInt(39081);
    const minScalar = is25519 ? _2n3 ** BigInt(254) : _2n3 ** BigInt(447);
    const maxAdded = is25519 ? BigInt(8) * (_2n3 ** BigInt(251) - _1n5) : BigInt(4) * (_2n3 ** BigInt(445) - _1n5);
    const maxScalar = minScalar + maxAdded + _1n5;
    const modP = (n) => mod(n, P);
    const GuBytes = encodeU(Gu);
    function encodeU(u) {
      return numberToBytesLE(modP(u), fieldLen);
    }
    function decodeU(u) {
      const _u = copyBytes2(abytes2(u, fieldLen, "uCoordinate"));
      if (is25519)
        _u[31] &= 127;
      return modP(bytesToNumberLE(_u));
    }
    function decodeScalar(scalar) {
      return bytesToNumberLE(adjustScalarBytes2(copyBytes2(abytes2(scalar, fieldLen, "scalar"))));
    }
    const lowOrderU = new Set(is25519 ? [
      _0n5,
      _1n5,
      P - _1n5,
      BigInt("325606250916557431795983626356110631294008115727848805560023387167927233504"),
      BigInt("39382357235489614581723060781553021112529911719440698176882885853963445705823")
    ] : [_0n5, _1n5, P - _1n5]);
    function scalarMult(scalar, u) {
      const pointU = decodeU(u);
      if (lowOrderU.has(pointU))
        throw new Error("invalid private or public key received");
      const pu = montgomeryLadder(pointU, decodeScalar(scalar));
      if (pu === _0n5)
        throw new Error("invalid private or public key received");
      return encodeU(pu);
    }
    function scalarMultBase(scalar) {
      if (mulBaseHook === void 0)
        return scalarMult(scalar, GuBytes);
      const k = decodeScalar(scalar);
      aInRange("scalar", k, minScalar, maxScalar);
      const pu = modP(mulBaseHook(k));
      if (pu === _0n5)
        throw new Error("invalid private or public key received");
      return encodeU(pu);
    }
    const getPublicKey = scalarMultBase;
    const getSharedSecret = scalarMult;
    function montgomeryLadder(u, scalar) {
      aInRange("u", u, _0n5, P);
      aInRange("scalar", scalar, minScalar, maxScalar);
      const k = scalar;
      const x_1 = u;
      let x_2 = _1n5;
      let z_2 = _0n5;
      let x_3 = u;
      let z_3 = _1n5;
      const kx = k ^ k >> _1n5;
      for (let t = BigInt(montgomeryBits - 1); t >= _0n5; t--) {
        const mask2 = cmask(P, kx >> t);
        ({ x_2, x_3 } = swap(mask2, x_2, x_3));
        ({ x_2: z_2, x_3: z_3 } = swap(mask2, z_2, z_3));
        const A = x_2 + z_2;
        const AA = modP(A * A);
        const B = x_2 - z_2;
        const BB = modP(B * B);
        const E = AA - BB;
        const C = x_3 + z_3;
        const D = x_3 - z_3;
        const DA = modP(D * A);
        const CB = modP(C * B);
        const dacb = DA + CB;
        const da_cb = DA - CB;
        x_3 = modP(dacb * dacb);
        z_3 = modP(x_1 * modP(da_cb * da_cb));
        x_2 = modP(AA * BB);
        z_2 = modP(E * (AA + modP(a24 * E)));
      }
      const mask = cmask(P, k);
      ({ x_2, x_3 } = swap(mask, x_2, x_3));
      ({ x_2: z_2, x_3: z_3 } = swap(mask, z_2, z_3));
      const z2 = powPminus2(z_2);
      return modP(x_2 * z2);
    }
    const lengths = {
      secretKey: fieldLen,
      publicKey: fieldLen,
      seed: fieldLen
    };
    const randomSecretKey = (seed) => {
      seed = seed === void 0 ? randomBytes_(fieldLen) : seed;
      abytes2(seed, lengths.seed, "seed");
      return seed;
    };
    const utils = { randomSecretKey };
    Object.freeze(lengths);
    Object.freeze(utils);
    return Object.freeze({
      keygen: createKeygen(randomSecretKey, getPublicKey),
      getSharedSecret,
      getPublicKey,
      scalarMult,
      scalarMultBase,
      utils,
      GuBytes: GuBytes.slice(),
      lengths
    });
  }
  var _0n5, _1n5, _2n3;
  var init_montgomery = __esm({
    "node_modules/@noble/curves/abstract/montgomery.js"() {
      init_utils2();
      init_curve();
      init_modular();
      /*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
      _0n5 = /* @__PURE__ */ BigInt(0);
      _1n5 = /* @__PURE__ */ BigInt(1);
      _2n3 = /* @__PURE__ */ BigInt(2);
    }
  });

  // node_modules/@noble/curves/ed25519.js
  function ed25519_pow_2_252_3(x) {
    const _10n = BigInt(10), _20n = BigInt(20), _40n = BigInt(40), _80n = BigInt(80);
    const P = ed25519_CURVE_p;
    const x2 = x * x % P;
    const b2 = x2 * x % P;
    const b4 = pow2(b2, _2n4, P) * b2 % P;
    const b5 = pow2(b4, _1n6, P) * x % P;
    const b10 = pow2(b5, _5n2, P) * b5 % P;
    const b20 = pow2(b10, _10n, P) * b10 % P;
    const b40 = pow2(b20, _20n, P) * b20 % P;
    const b80 = pow2(b40, _40n, P) * b40 % P;
    const b160 = pow2(b80, _80n, P) * b80 % P;
    const b240 = pow2(b160, _80n, P) * b80 % P;
    const b250 = pow2(b240, _10n, P) * b10 % P;
    const pow_p_5_8 = pow2(b250, _2n4, P) * x % P;
    return { pow_p_5_8, b2 };
  }
  function adjustScalarBytes(bytes2) {
    bytes2[0] &= 248;
    bytes2[31] &= 127;
    bytes2[31] |= 64;
    return bytes2;
  }
  function uvRatio(u, v) {
    const P = ed25519_CURVE_p;
    const v3 = mod(v * v * v, P);
    const v7 = mod(v3 * v3 * v, P);
    const pow3 = ed25519_pow_2_252_3(u * v7).pow_p_5_8;
    let x = mod(u * v3 * pow3, P);
    const vx2 = mod(v * x * x, P);
    const root1 = x;
    const root2 = mod(x * ED25519_SQRT_M1, P);
    const useRoot1 = vx2 === u;
    const useRoot2 = vx2 === mod(-u, P);
    const noRoot = vx2 === mod(-u * ED25519_SQRT_M1, P);
    if (useRoot1)
      x = root1;
    if (useRoot2 || noRoot)
      x = root2;
    if (isNegativeLE(x, P))
      x = mod(-x, P);
    return { isValid: useRoot1 || useRoot2, value: x };
  }
  var _0n6, _1n6, _2n4, _3n2, _5n2, _8n3, ed25519_CURVE_p, ed25519_CURVE, ED25519_SQRT_M1, ed25519_Point, x25519;
  var init_ed25519 = __esm({
    "node_modules/@noble/curves/ed25519.js"() {
      init_edwards();
      init_modular();
      init_montgomery();
      /*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
      _0n6 = /* @__PURE__ */ BigInt(0);
      _1n6 = /* @__PURE__ */ BigInt(1);
      _2n4 = /* @__PURE__ */ BigInt(2);
      _3n2 = /* @__PURE__ */ BigInt(3);
      _5n2 = /* @__PURE__ */ BigInt(5);
      _8n3 = /* @__PURE__ */ BigInt(8);
      ed25519_CURVE_p = /* @__PURE__ */ BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffed");
      ed25519_CURVE = /* @__PURE__ */ (() => ({
        p: ed25519_CURVE_p,
        n: BigInt("0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed"),
        h: _8n3,
        a: BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffec"),
        d: BigInt("0x52036cee2b6ffe738cc740797779e89800700a4d4141d8ab75eb4dca135978a3"),
        Gx: BigInt("0x216936d3cd6e53fec0a4e231fdd6dc5c692cc7609525a7b2c9562d608f25d51a"),
        Gy: BigInt("0x6666666666666666666666666666666666666666666666666666666666666658")
      }))();
      ED25519_SQRT_M1 = /* @__PURE__ */ BigInt("19681161376707505956807079304988542015446066515923890162744021073123829784752");
      ed25519_Point = /* @__PURE__ */ edwards(ed25519_CURVE, { uvRatio });
      x25519 = /* @__PURE__ */ (() => {
        const P = ed25519_CURVE_p;
        const powPminus2 = (x) => {
          const { pow_p_5_8, b2 } = ed25519_pow_2_252_3(x);
          return mod(pow2(pow_p_5_8, _3n2, P) * b2, P);
        };
        return montgomery({
          P,
          type: "x25519",
          powPminus2,
          adjustScalarBytes,
          // ~3x faster fixed-base: [k]B on the birationally-equivalent Edwards curve using cached
          // base tables, mapped back via u = (1+y)/(1-y) = (Z+Y)/(Z-Y) with one Fermat inversion.
          // Same construction as libsodium's crypto_scalarmult_curve25519_base.
          scalarMultBase: (k) => {
            const kn = mod(k, ed25519_Point.Fn.ORDER);
            if (kn === _0n6)
              return _0n6;
            const p = ed25519_Point.BASE.multiply(kn);
            return mod((p.Z + p.Y) * powPminus2(mod(p.Z - p.Y, P)), P);
          }
        });
      })();
    }
  });

  // node_modules/@noble/ciphers/utils.js
  function isBytes3(a) {
    return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in a && a.BYTES_PER_ELEMENT === 1;
  }
  function abool2(value, title = "") {
    if (typeof value !== "boolean")
      throw new TypeError(atitle3(title) + "expected boolean, got type=" + typeof value);
    return value;
  }
  function anumber3(n, title = "") {
    if (typeof n !== "number")
      throw new TypeError(atitle3(title) + "expected number, got " + typeof n);
    if (!Number.isSafeInteger(n) || n < 0)
      throw new RangeError(atitle3(title) + "expected integer >= 0, got " + n);
    return n;
  }
  function abytes3(value, length, title = "") {
    if (isBytes3(value) && (length === void 0 || value.length === length))
      return value;
    if (length !== void 0)
      anumber3(length, "length");
    const bytes2 = isBytes3(value);
    const ofLen = length !== void 0 ? ` of length ${length}` : "";
    const got = bytes2 ? `length=${value.length}` : `type=${typeof value}`;
    const message = atitle3(title) + "expected Uint8Array" + ofLen + ", got " + got;
    if (!bytes2)
      throw new TypeError(message);
    throw new RangeError(message);
  }
  function aexists2(instance, checkFinished = true) {
    if (instance.destroyed)
      throw new Error("hash was destroyed");
    if (checkFinished && instance.finished)
      throw new Error("digest() was already called");
  }
  function aoutput2(out, instance) {
    abytes3(out, void 0, "output");
    const min = instance.outputLen;
    if (!(out.length >= min)) {
      throw new RangeError('"output" expected length >= ' + min);
    }
  }
  function u322(arr) {
    return new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
  }
  function clean2(...arrays) {
    for (let i = 0; i < arrays.length; i++) {
      arrays[i].fill(0);
    }
  }
  function createView(arr) {
    return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
  }
  function byteSwap2(word) {
    return word << 24 & 4278190080 | word << 8 & 16711680 | word >>> 8 & 65280 | word >>> 24 & 255;
  }
  function byteSwap322(arr) {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = byteSwap2(arr[i]);
    }
    return arr;
  }
  function overlapBytes(a, b) {
    if (!a.byteLength || !b.byteLength)
      return false;
    return a.buffer === b.buffer && // best we can do, may fail with an obscure Proxy
    a.byteOffset < b.byteOffset + b.byteLength && // a starts before b end
    b.byteOffset < a.byteOffset + a.byteLength;
  }
  function complexOverlapBytes(input, output) {
    if (overlapBytes(input, output) && input.byteOffset < output.byteOffset)
      throw new Error("complex overlap of input and output is not supported");
  }
  function checkOpts2(defaults, opts) {
    aobject3(defaults, "defaults");
    aobject3(opts, "opts");
    const merged = Object.assign(defaults, opts);
    return merged;
  }
  function equalBytes(a, b) {
    a = abytes3(a);
    b = abytes3(b);
    if (a.length !== b.length)
      return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++)
      diff |= a[i] ^ b[i];
    return diff === 0;
  }
  function wrapMacConstructor(keyLen, macCons, fromMsg) {
    const mac = macCons;
    const getArgs = fromMsg || (() => []);
    const macC = (msg, key) => mac(key, ...getArgs(msg)).update(msg).digest();
    const tmp = mac(new Uint8Array(keyLen), ...getArgs(new Uint8Array(0)));
    macC.outputLen = tmp.outputLen;
    macC.blockLen = tmp.blockLen;
    macC.create = (key, ...args) => mac(key, ...args);
    return macC;
  }
  function getOutput(expectedLength, out, onlyAligned = true) {
    if (out === void 0)
      return new Uint8Array(expectedLength);
    abytes3(out, expectedLength, "output");
    if (onlyAligned && !isAligned32(out))
      throw new Error("invalid output, must be aligned");
    return out;
  }
  function u64Lengths(dataLength, aadLength, isLE3) {
    anumber3(dataLength);
    anumber3(aadLength);
    abool2(isLE3);
    const num = new Uint8Array(16);
    const view = createView(num);
    view.setBigUint64(0, BigInt(aadLength), isLE3);
    view.setBigUint64(8, BigInt(dataLength), isLE3);
    return num;
  }
  function isAligned32(bytes2) {
    return bytes2.byteOffset % 4 === 0;
  }
  function copyBytes3(bytes2) {
    return Uint8Array.from(abytes3(bytes2));
  }
  var atitle3, aobject3, isLE2, swap32IfBE2, wrapCipher;
  var init_utils3 = __esm({
    "node_modules/@noble/ciphers/utils.js"() {
      /*! noble-ciphers - MIT License (c) 2023 Paul Miller (paulmillr.com) */
      atitle3 = (title) => title ? `"${title}" ` : "";
      aobject3 = (value, label) => {
        if (value === null || typeof value !== "object" || Array.isArray(value))
          throw new TypeError(label === "object" ? "expected valid options object" : `"${label}" expected object, got type=${typeof value}`);
      };
      isLE2 = /* @__PURE__ */ (() => new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68)();
      swap32IfBE2 = isLE2 ? (u) => u : byteSwap322;
      wrapCipher = /* @__NO_SIDE_EFFECTS__ */ (params, constructor) => {
        function wrappedCipher(key, ...args) {
          abytes3(key, void 0, "key");
          if (params.nonceLength !== void 0) {
            const nonce = args[0];
            abytes3(nonce, params.varSizeNonce ? void 0 : params.nonceLength, "nonce");
          }
          const tagl = params.tagLength;
          const aadStart = params.nonceLength !== void 0 ? 1 : 0;
          if (!params.withAAD) {
            for (let i = aadStart; i < args.length; i++)
              if (isBytes3(args[i]))
                throw new Error("AAD not supported");
          }
          if (params.withAAD && args[aadStart] !== void 0)
            abytes3(args[aadStart], void 0, "AAD");
          const cipher = constructor(key, ...args);
          const checkOutput = (fnLength, output) => {
            if (output !== void 0) {
              if (fnLength !== 2)
                throw new Error("cipher output not supported");
              abytes3(output, void 0, "output");
            }
          };
          let called = false;
          const wrCipher = {
            encrypt(data, output) {
              if (called)
                throw new Error("cannot encrypt() twice with same key + nonce");
              called = true;
              abytes3(data, void 0, "data");
              checkOutput(cipher.encrypt.length, output);
              return cipher.encrypt(data, output);
            },
            decrypt(data, output) {
              abytes3(data, void 0, "data");
              if (tagl && data.length < tagl)
                throw new Error('"ciphertext" expected length >= tagLength=' + tagl);
              checkOutput(cipher.decrypt.length, output);
              return cipher.decrypt(data, output);
            }
          };
          return wrCipher;
        }
        Object.assign(wrappedCipher, params);
        return wrappedCipher;
      };
    }
  });

  // node_modules/@noble/ciphers/_arx.js
  function rotl(a, b) {
    return a << b | a >>> 32 - b;
  }
  function runCipher(core, sigma, key, nonce, data, output, counter, rounds) {
    const len = data.length;
    const block = new Uint8Array(BLOCK_LEN);
    const b32 = u322(block);
    const isAligned = isLE2 && isAligned32(data) && isAligned32(output);
    const d32 = isAligned ? u322(data) : U32_EMPTY;
    const o32 = isAligned ? u322(output) : U32_EMPTY;
    if (!isLE2) {
      for (let pos = 0; pos < len; counter++) {
        core(sigma, key, nonce, b32, counter, rounds);
        swap32IfBE2(b32);
        if (counter >= MAX_COUNTER)
          throw new Error("arx: counter overflow");
        const take = Math.min(BLOCK_LEN, len - pos);
        for (let j = 0, posj; j < take; j++) {
          posj = pos + j;
          output[posj] = data[posj] ^ block[j];
        }
        pos += take;
      }
      return;
    }
    for (let pos = 0; pos < len; counter++) {
      core(sigma, key, nonce, b32, counter, rounds);
      if (counter >= MAX_COUNTER)
        throw new Error("arx: counter overflow");
      const take = Math.min(BLOCK_LEN, len - pos);
      if (isAligned && take === BLOCK_LEN) {
        const pos32 = pos / 4;
        if (pos % 4 !== 0)
          throw new Error("arx: invalid block position");
        for (let j = 0, posj; j < BLOCK_LEN32; j++) {
          posj = pos32 + j;
          o32[posj] = d32[posj] ^ b32[j];
        }
        pos += BLOCK_LEN;
        continue;
      }
      for (let j = 0, posj; j < take; j++) {
        posj = pos + j;
        output[posj] = data[posj] ^ block[j];
      }
      pos += take;
    }
  }
  function createCipher(core, opts) {
    const { allowShortKeys, extendNonceFn, counterLength, counterRight, rounds } = checkOpts2({ allowShortKeys: false, counterLength: 8, counterRight: false, rounds: 20 }, opts);
    if (typeof core !== "function")
      throw new Error("core must be a function");
    anumber3(counterLength);
    anumber3(rounds);
    abool2(counterRight);
    abool2(allowShortKeys);
    return (key, nonce, data, output, counter = 0) => {
      abytes3(key, void 0, "key");
      abytes3(nonce, void 0, "nonce");
      abytes3(data, void 0, "data");
      const len = data.length;
      const hasOutput = output !== void 0;
      output = getOutput(len, output, false);
      if (hasOutput)
        complexOverlapBytes(data, output);
      anumber3(counter);
      if (counter < 0 || counter >= MAX_COUNTER)
        throw new Error("arx: counter overflow");
      const toClean = [];
      let l = key.length;
      let k;
      let sigma;
      if (l === 32) {
        toClean.push(k = copyBytes3(key));
        sigma = sigma32_32;
      } else if (l === 16 && allowShortKeys) {
        k = new Uint8Array(32);
        k.set(key);
        k.set(key, 16);
        sigma = sigma16_32;
        toClean.push(k);
      } else {
        abytes3(key, 32, "arx key");
        throw new Error("invalid key size");
      }
      if (!isLE2 || !isAligned32(nonce))
        toClean.push(nonce = copyBytes3(nonce));
      let k32 = u322(k);
      if (extendNonceFn) {
        if (nonce.length !== 24)
          throw new Error("arx: extended nonce must be 24 bytes");
        const n16 = nonce.subarray(0, 16);
        if (isLE2)
          extendNonceFn(sigma, k32, u322(n16), k32);
        else {
          const sigmaRaw = swap32IfBE2(Uint32Array.from(sigma));
          extendNonceFn(sigmaRaw, k32, u322(n16), k32);
          clean2(sigmaRaw);
          swap32IfBE2(k32);
        }
        nonce = nonce.subarray(16);
      } else if (!isLE2)
        swap32IfBE2(k32);
      const nonceNcLen = 16 - counterLength;
      if (nonceNcLen !== nonce.length)
        throw new Error(`arx: nonce must be ${nonceNcLen} or 16 bytes`);
      if (nonceNcLen !== 12) {
        const nc = new Uint8Array(12);
        nc.set(nonce, counterRight ? 0 : 12 - nonce.length);
        nonce = nc;
        toClean.push(nonce);
      }
      const n32 = swap32IfBE2(u322(nonce));
      try {
        runCipher(core, sigma, k32, n32, data, output, counter, rounds);
        return output;
      } finally {
        clean2(...toClean);
      }
    };
  }
  var encodeStr, sigma16_32, sigma32_32, BLOCK_LEN, BLOCK_LEN32, MAX_COUNTER, U32_EMPTY;
  var init_arx = __esm({
    "node_modules/@noble/ciphers/_arx.js"() {
      init_utils3();
      encodeStr = (str) => Uint8Array.from(str.split(""), (c) => c.charCodeAt(0));
      sigma16_32 = /* @__PURE__ */ (() => swap32IfBE2(u322(encodeStr("expand 16-byte k"))))();
      sigma32_32 = /* @__PURE__ */ (() => swap32IfBE2(u322(encodeStr("expand 32-byte k"))))();
      BLOCK_LEN = 64;
      BLOCK_LEN32 = 16;
      MAX_COUNTER = /* @__PURE__ */ (() => 2 ** 32 - 1)();
      U32_EMPTY = /* @__PURE__ */ Uint32Array.of();
    }
  });

  // node_modules/@noble/ciphers/_poly1305.js
  function u8to16(a, i) {
    return a[i++] & 255 | (a[i++] & 255) << 8;
  }
  var Poly1305, poly1305;
  var init_poly1305 = __esm({
    "node_modules/@noble/ciphers/_poly1305.js"() {
      init_utils3();
      Poly1305 = class {
        blockLen = 16;
        outputLen = 16;
        buffer = new Uint8Array(16);
        r = new Uint16Array(10);
        // Allocating 1 array with .subarray() here is slower than 3
        h = new Uint16Array(10);
        pad = new Uint16Array(8);
        pos = 0;
        finished = false;
        destroyed = false;
        // Can be speed-up using BigUint64Array, at the cost of complexity
        constructor(key) {
          key = copyBytes3(abytes3(key, 32, "key"));
          const t0 = u8to16(key, 0);
          const t1 = u8to16(key, 2);
          const t2 = u8to16(key, 4);
          const t3 = u8to16(key, 6);
          const t4 = u8to16(key, 8);
          const t5 = u8to16(key, 10);
          const t6 = u8to16(key, 12);
          const t7 = u8to16(key, 14);
          this.r[0] = t0 & 8191;
          this.r[1] = (t0 >>> 13 | t1 << 3) & 8191;
          this.r[2] = (t1 >>> 10 | t2 << 6) & 7939;
          this.r[3] = (t2 >>> 7 | t3 << 9) & 8191;
          this.r[4] = (t3 >>> 4 | t4 << 12) & 255;
          this.r[5] = t4 >>> 1 & 8190;
          this.r[6] = (t4 >>> 14 | t5 << 2) & 8191;
          this.r[7] = (t5 >>> 11 | t6 << 5) & 8065;
          this.r[8] = (t6 >>> 8 | t7 << 8) & 8191;
          this.r[9] = t7 >>> 5 & 127;
          for (let i = 0; i < 8; i++)
            this.pad[i] = u8to16(key, 16 + 2 * i);
        }
        process(data, offset, isLast = false) {
          const hibit = isLast ? 0 : 1 << 11;
          const { h, r } = this;
          const r0 = r[0];
          const r1 = r[1];
          const r2 = r[2];
          const r3 = r[3];
          const r4 = r[4];
          const r5 = r[5];
          const r6 = r[6];
          const r7 = r[7];
          const r8 = r[8];
          const r9 = r[9];
          const t0 = u8to16(data, offset + 0);
          const t1 = u8to16(data, offset + 2);
          const t2 = u8to16(data, offset + 4);
          const t3 = u8to16(data, offset + 6);
          const t4 = u8to16(data, offset + 8);
          const t5 = u8to16(data, offset + 10);
          const t6 = u8to16(data, offset + 12);
          const t7 = u8to16(data, offset + 14);
          let h0 = h[0] + (t0 & 8191);
          let h1 = h[1] + ((t0 >>> 13 | t1 << 3) & 8191);
          let h2 = h[2] + ((t1 >>> 10 | t2 << 6) & 8191);
          let h3 = h[3] + ((t2 >>> 7 | t3 << 9) & 8191);
          let h4 = h[4] + ((t3 >>> 4 | t4 << 12) & 8191);
          let h5 = h[5] + (t4 >>> 1 & 8191);
          let h6 = h[6] + ((t4 >>> 14 | t5 << 2) & 8191);
          let h7 = h[7] + ((t5 >>> 11 | t6 << 5) & 8191);
          let h8 = h[8] + ((t6 >>> 8 | t7 << 8) & 8191);
          let h9 = h[9] + (t7 >>> 5 | hibit);
          let c = 0;
          let d0 = c + h0 * r0 + h1 * (5 * r9) + h2 * (5 * r8) + h3 * (5 * r7) + h4 * (5 * r6);
          c = d0 >>> 13;
          d0 &= 8191;
          d0 += h5 * (5 * r5) + h6 * (5 * r4) + h7 * (5 * r3) + h8 * (5 * r2) + h9 * (5 * r1);
          c += d0 >>> 13;
          d0 &= 8191;
          let d1 = c + h0 * r1 + h1 * r0 + h2 * (5 * r9) + h3 * (5 * r8) + h4 * (5 * r7);
          c = d1 >>> 13;
          d1 &= 8191;
          d1 += h5 * (5 * r6) + h6 * (5 * r5) + h7 * (5 * r4) + h8 * (5 * r3) + h9 * (5 * r2);
          c += d1 >>> 13;
          d1 &= 8191;
          let d2 = c + h0 * r2 + h1 * r1 + h2 * r0 + h3 * (5 * r9) + h4 * (5 * r8);
          c = d2 >>> 13;
          d2 &= 8191;
          d2 += h5 * (5 * r7) + h6 * (5 * r6) + h7 * (5 * r5) + h8 * (5 * r4) + h9 * (5 * r3);
          c += d2 >>> 13;
          d2 &= 8191;
          let d3 = c + h0 * r3 + h1 * r2 + h2 * r1 + h3 * r0 + h4 * (5 * r9);
          c = d3 >>> 13;
          d3 &= 8191;
          d3 += h5 * (5 * r8) + h6 * (5 * r7) + h7 * (5 * r6) + h8 * (5 * r5) + h9 * (5 * r4);
          c += d3 >>> 13;
          d3 &= 8191;
          let d4 = c + h0 * r4 + h1 * r3 + h2 * r2 + h3 * r1 + h4 * r0;
          c = d4 >>> 13;
          d4 &= 8191;
          d4 += h5 * (5 * r9) + h6 * (5 * r8) + h7 * (5 * r7) + h8 * (5 * r6) + h9 * (5 * r5);
          c += d4 >>> 13;
          d4 &= 8191;
          let d5 = c + h0 * r5 + h1 * r4 + h2 * r3 + h3 * r2 + h4 * r1;
          c = d5 >>> 13;
          d5 &= 8191;
          d5 += h5 * r0 + h6 * (5 * r9) + h7 * (5 * r8) + h8 * (5 * r7) + h9 * (5 * r6);
          c += d5 >>> 13;
          d5 &= 8191;
          let d6 = c + h0 * r6 + h1 * r5 + h2 * r4 + h3 * r3 + h4 * r2;
          c = d6 >>> 13;
          d6 &= 8191;
          d6 += h5 * r1 + h6 * r0 + h7 * (5 * r9) + h8 * (5 * r8) + h9 * (5 * r7);
          c += d6 >>> 13;
          d6 &= 8191;
          let d7 = c + h0 * r7 + h1 * r6 + h2 * r5 + h3 * r4 + h4 * r3;
          c = d7 >>> 13;
          d7 &= 8191;
          d7 += h5 * r2 + h6 * r1 + h7 * r0 + h8 * (5 * r9) + h9 * (5 * r8);
          c += d7 >>> 13;
          d7 &= 8191;
          let d8 = c + h0 * r8 + h1 * r7 + h2 * r6 + h3 * r5 + h4 * r4;
          c = d8 >>> 13;
          d8 &= 8191;
          d8 += h5 * r3 + h6 * r2 + h7 * r1 + h8 * r0 + h9 * (5 * r9);
          c += d8 >>> 13;
          d8 &= 8191;
          let d9 = c + h0 * r9 + h1 * r8 + h2 * r7 + h3 * r6 + h4 * r5;
          c = d9 >>> 13;
          d9 &= 8191;
          d9 += h5 * r4 + h6 * r3 + h7 * r2 + h8 * r1 + h9 * r0;
          c += d9 >>> 13;
          d9 &= 8191;
          c = (c << 2) + c | 0;
          c = c + d0 | 0;
          d0 = c & 8191;
          c = c >>> 13;
          d1 += c;
          h[0] = d0;
          h[1] = d1;
          h[2] = d2;
          h[3] = d3;
          h[4] = d4;
          h[5] = d5;
          h[6] = d6;
          h[7] = d7;
          h[8] = d8;
          h[9] = d9;
        }
        finalize() {
          const { h, pad } = this;
          const g = new Uint16Array(10);
          let c = h[1] >>> 13;
          h[1] &= 8191;
          for (let i = 2; i < 10; i++) {
            h[i] += c;
            c = h[i] >>> 13;
            h[i] &= 8191;
          }
          h[0] += c * 5;
          c = h[0] >>> 13;
          h[0] &= 8191;
          h[1] += c;
          c = h[1] >>> 13;
          h[1] &= 8191;
          h[2] += c;
          g[0] = h[0] + 5;
          c = g[0] >>> 13;
          g[0] &= 8191;
          for (let i = 1; i < 10; i++) {
            g[i] = h[i] + c;
            c = g[i] >>> 13;
            g[i] &= 8191;
          }
          g[9] -= 1 << 13;
          let mask = (c ^ 1) - 1;
          for (let i = 0; i < 10; i++)
            g[i] &= mask;
          mask = ~mask;
          for (let i = 0; i < 10; i++)
            h[i] = h[i] & mask | g[i];
          h[0] = (h[0] | h[1] << 13) & 65535;
          h[1] = (h[1] >>> 3 | h[2] << 10) & 65535;
          h[2] = (h[2] >>> 6 | h[3] << 7) & 65535;
          h[3] = (h[3] >>> 9 | h[4] << 4) & 65535;
          h[4] = (h[4] >>> 12 | h[5] << 1 | h[6] << 14) & 65535;
          h[5] = (h[6] >>> 2 | h[7] << 11) & 65535;
          h[6] = (h[7] >>> 5 | h[8] << 8) & 65535;
          h[7] = (h[8] >>> 8 | h[9] << 5) & 65535;
          let f = h[0] + pad[0];
          h[0] = f & 65535;
          for (let i = 1; i < 8; i++) {
            f = (h[i] + pad[i] | 0) + (f >>> 16) | 0;
            h[i] = f & 65535;
          }
          clean2(g);
        }
        update(data) {
          aexists2(this);
          abytes3(data);
          data = copyBytes3(data);
          const { buffer, blockLen } = this;
          const len = data.length;
          for (let pos = 0; pos < len; ) {
            const take = Math.min(blockLen - this.pos, len - pos);
            if (take === blockLen) {
              for (; blockLen <= len - pos; pos += blockLen)
                this.process(data, pos);
              continue;
            }
            buffer.set(data.subarray(pos, pos + take), this.pos);
            this.pos += take;
            pos += take;
            if (this.pos === blockLen) {
              this.process(buffer, 0, false);
              this.pos = 0;
            }
          }
          return this;
        }
        destroy() {
          this.destroyed = true;
          clean2(this.h, this.r, this.buffer, this.pad);
        }
        digestInto(out) {
          aexists2(this);
          aoutput2(out, this);
          this.finished = true;
          const { buffer, h } = this;
          let { pos } = this;
          if (pos) {
            buffer[pos++] = 1;
            for (; pos < 16; pos++)
              buffer[pos] = 0;
            this.process(buffer, 0, true);
          }
          this.finalize();
          let opos = 0;
          for (let i = 0; i < 8; i++) {
            out[opos++] = h[i] >>> 0;
            out[opos++] = h[i] >>> 8;
          }
        }
        digest() {
          const { buffer, outputLen } = this;
          this.digestInto(buffer);
          const res = buffer.slice(0, outputLen);
          this.destroy();
          return res;
        }
      };
      poly1305 = /* @__PURE__ */ wrapMacConstructor(32, (key) => new Poly1305(key));
    }
  });

  // node_modules/@noble/ciphers/chacha.js
  function chachaCore(s, k, n, out, cnt, rounds = 20) {
    let y00 = s[0], y01 = s[1], y02 = s[2], y03 = s[3], y04 = k[0], y05 = k[1], y06 = k[2], y07 = k[3], y08 = k[4], y09 = k[5], y10 = k[6], y11 = k[7], y12 = cnt, y13 = n[0], y14 = n[1], y15 = n[2];
    let x00 = y00, x01 = y01, x02 = y02, x03 = y03, x04 = y04, x05 = y05, x06 = y06, x07 = y07, x08 = y08, x09 = y09, x10 = y10, x11 = y11, x12 = y12, x13 = y13, x14 = y14, x15 = y15;
    for (let r = 0; r < rounds; r += 2) {
      x00 = x00 + x04 | 0;
      x12 = rotl(x12 ^ x00, 16);
      x08 = x08 + x12 | 0;
      x04 = rotl(x04 ^ x08, 12);
      x00 = x00 + x04 | 0;
      x12 = rotl(x12 ^ x00, 8);
      x08 = x08 + x12 | 0;
      x04 = rotl(x04 ^ x08, 7);
      x01 = x01 + x05 | 0;
      x13 = rotl(x13 ^ x01, 16);
      x09 = x09 + x13 | 0;
      x05 = rotl(x05 ^ x09, 12);
      x01 = x01 + x05 | 0;
      x13 = rotl(x13 ^ x01, 8);
      x09 = x09 + x13 | 0;
      x05 = rotl(x05 ^ x09, 7);
      x02 = x02 + x06 | 0;
      x14 = rotl(x14 ^ x02, 16);
      x10 = x10 + x14 | 0;
      x06 = rotl(x06 ^ x10, 12);
      x02 = x02 + x06 | 0;
      x14 = rotl(x14 ^ x02, 8);
      x10 = x10 + x14 | 0;
      x06 = rotl(x06 ^ x10, 7);
      x03 = x03 + x07 | 0;
      x15 = rotl(x15 ^ x03, 16);
      x11 = x11 + x15 | 0;
      x07 = rotl(x07 ^ x11, 12);
      x03 = x03 + x07 | 0;
      x15 = rotl(x15 ^ x03, 8);
      x11 = x11 + x15 | 0;
      x07 = rotl(x07 ^ x11, 7);
      x00 = x00 + x05 | 0;
      x15 = rotl(x15 ^ x00, 16);
      x10 = x10 + x15 | 0;
      x05 = rotl(x05 ^ x10, 12);
      x00 = x00 + x05 | 0;
      x15 = rotl(x15 ^ x00, 8);
      x10 = x10 + x15 | 0;
      x05 = rotl(x05 ^ x10, 7);
      x01 = x01 + x06 | 0;
      x12 = rotl(x12 ^ x01, 16);
      x11 = x11 + x12 | 0;
      x06 = rotl(x06 ^ x11, 12);
      x01 = x01 + x06 | 0;
      x12 = rotl(x12 ^ x01, 8);
      x11 = x11 + x12 | 0;
      x06 = rotl(x06 ^ x11, 7);
      x02 = x02 + x07 | 0;
      x13 = rotl(x13 ^ x02, 16);
      x08 = x08 + x13 | 0;
      x07 = rotl(x07 ^ x08, 12);
      x02 = x02 + x07 | 0;
      x13 = rotl(x13 ^ x02, 8);
      x08 = x08 + x13 | 0;
      x07 = rotl(x07 ^ x08, 7);
      x03 = x03 + x04 | 0;
      x14 = rotl(x14 ^ x03, 16);
      x09 = x09 + x14 | 0;
      x04 = rotl(x04 ^ x09, 12);
      x03 = x03 + x04 | 0;
      x14 = rotl(x14 ^ x03, 8);
      x09 = x09 + x14 | 0;
      x04 = rotl(x04 ^ x09, 7);
    }
    let oi = 0;
    out[oi++] = y00 + x00 | 0;
    out[oi++] = y01 + x01 | 0;
    out[oi++] = y02 + x02 | 0;
    out[oi++] = y03 + x03 | 0;
    out[oi++] = y04 + x04 | 0;
    out[oi++] = y05 + x05 | 0;
    out[oi++] = y06 + x06 | 0;
    out[oi++] = y07 + x07 | 0;
    out[oi++] = y08 + x08 | 0;
    out[oi++] = y09 + x09 | 0;
    out[oi++] = y10 + x10 | 0;
    out[oi++] = y11 + x11 | 0;
    out[oi++] = y12 + x12 | 0;
    out[oi++] = y13 + x13 | 0;
    out[oi++] = y14 + x14 | 0;
    out[oi++] = y15 + x15 | 0;
  }
  function computeTag(fn, key, nonce, ciphertext, AAD) {
    if (AAD !== void 0)
      abytes3(AAD, void 0, "AAD");
    const authKey = fn(key, nonce, ZEROS32);
    const lengths = u64Lengths(ciphertext.length, AAD ? AAD.length : 0, true);
    const h = poly1305.create(authKey);
    if (AAD)
      updatePadded(h, AAD);
    updatePadded(h, ciphertext);
    h.update(lengths);
    const res = h.digest();
    clean2(authKey, lengths);
    return res;
  }
  var chacha20, ZEROS16, updatePadded, ZEROS32, _poly1305_aead, chacha20poly1305;
  var init_chacha = __esm({
    "node_modules/@noble/ciphers/chacha.js"() {
      init_arx();
      init_poly1305();
      init_utils3();
      chacha20 = /* @__PURE__ */ createCipher(chachaCore, {
        counterRight: false,
        counterLength: 4,
        allowShortKeys: false
      });
      ZEROS16 = /* @__PURE__ */ new Uint8Array(16);
      updatePadded = (h, msg) => {
        h.update(msg);
        const leftover = msg.length % 16;
        if (leftover)
          h.update(ZEROS16.subarray(leftover));
      };
      ZEROS32 = /* @__PURE__ */ new Uint8Array(32);
      _poly1305_aead = (xorStream) => (key, nonce, AAD) => {
        const tagLength = 16;
        return {
          encrypt(plaintext, output) {
            const plength = plaintext.length;
            output = getOutput(plength + tagLength, output, false);
            output.set(plaintext);
            const oPlain = output.subarray(0, -tagLength);
            xorStream(key, nonce, oPlain, oPlain, 1);
            const tag = computeTag(xorStream, key, nonce, oPlain, AAD);
            output.set(tag, plength);
            clean2(tag);
            return output;
          },
          decrypt(ciphertext, output) {
            output = getOutput(ciphertext.length - tagLength, output, false);
            const data = ciphertext.subarray(0, -tagLength);
            const passedTag = ciphertext.subarray(-tagLength);
            const tag = computeTag(xorStream, key, nonce, data, AAD);
            if (!equalBytes(passedTag, tag)) {
              clean2(tag);
              throw new Error("invalid tag");
            }
            output.set(ciphertext.subarray(0, -tagLength));
            xorStream(key, nonce, output, output, 1);
            clean2(tag);
            return output;
          }
        };
      };
      chacha20poly1305 = /* @__PURE__ */ wrapCipher(
        { blockSize: 64, nonceLength: 12, tagLength: 16, withAAD: true },
        /* @__PURE__ */ _poly1305_aead(chacha20)
      );
    }
  });

  // node_modules/@noble/hashes/_blake.js
  var BSIGMA;
  var init_blake = __esm({
    "node_modules/@noble/hashes/_blake.js"() {
      BSIGMA = /* @__PURE__ */ Uint8Array.from([
        0,
        1,
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        11,
        12,
        13,
        14,
        15,
        14,
        10,
        4,
        8,
        9,
        15,
        13,
        6,
        1,
        12,
        0,
        2,
        11,
        7,
        5,
        3,
        11,
        8,
        12,
        0,
        5,
        2,
        15,
        13,
        10,
        14,
        3,
        6,
        7,
        1,
        9,
        4,
        7,
        9,
        3,
        1,
        13,
        12,
        11,
        14,
        2,
        6,
        5,
        10,
        4,
        0,
        15,
        8,
        9,
        0,
        5,
        7,
        2,
        4,
        10,
        15,
        14,
        1,
        11,
        12,
        6,
        8,
        3,
        13,
        2,
        12,
        6,
        10,
        0,
        11,
        8,
        3,
        4,
        13,
        7,
        5,
        15,
        14,
        1,
        9,
        12,
        5,
        1,
        15,
        14,
        13,
        4,
        10,
        0,
        7,
        6,
        3,
        9,
        2,
        8,
        11,
        13,
        11,
        7,
        14,
        12,
        1,
        3,
        9,
        5,
        0,
        15,
        4,
        8,
        6,
        2,
        10,
        6,
        15,
        14,
        9,
        11,
        3,
        0,
        8,
        12,
        2,
        13,
        7,
        1,
        4,
        10,
        5,
        10,
        2,
        8,
        4,
        7,
        6,
        1,
        5,
        15,
        11,
        9,
        14,
        3,
        12,
        13,
        0,
        0,
        1,
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        11,
        12,
        13,
        14,
        15,
        14,
        10,
        4,
        8,
        9,
        15,
        13,
        6,
        1,
        12,
        0,
        2,
        11,
        7,
        5,
        3,
        // Blake1, unused in others
        11,
        8,
        12,
        0,
        5,
        2,
        15,
        13,
        10,
        14,
        3,
        6,
        7,
        1,
        9,
        4,
        7,
        9,
        3,
        1,
        13,
        12,
        11,
        14,
        2,
        6,
        5,
        10,
        4,
        0,
        15,
        8,
        9,
        0,
        5,
        7,
        2,
        4,
        10,
        15,
        14,
        1,
        11,
        12,
        6,
        8,
        3,
        13,
        2,
        12,
        6,
        10,
        0,
        11,
        8,
        3,
        4,
        13,
        7,
        5,
        15,
        14,
        1,
        9
      ]);
    }
  });

  // node_modules/@noble/hashes/blake2.js
  function G1b(a, b, c, d, msg, x) {
    const Xl = msg[x], Xh = msg[x + 1];
    let Al = BBUF[2 * a], Ah = BBUF[2 * a + 1];
    let Bl = BBUF[2 * b], Bh = BBUF[2 * b + 1];
    let Cl = BBUF[2 * c], Ch = BBUF[2 * c + 1];
    let Dl = BBUF[2 * d], Dh = BBUF[2 * d + 1];
    const ll = add3L(Al, Bl, Xl);
    Ah = add3H(ll, Ah, Bh, Xh);
    Al = ll | 0;
    let xh = Dh ^ Ah, xl = Dl ^ Al;
    Dh = rotr32H(xh, xl);
    Dl = rotr32L(xh, xl);
    ({ h: Ch, l: Cl } = add(Ch, Cl, Dh, Dl));
    xh = Bh ^ Ch;
    xl = Bl ^ Cl;
    Bh = rotrSH(xh, xl, 24);
    Bl = rotrSL(xh, xl, 24);
    BBUF[2 * a] = Al;
    BBUF[2 * a + 1] = Ah;
    BBUF[2 * b] = Bl;
    BBUF[2 * b + 1] = Bh;
    BBUF[2 * c] = Cl;
    BBUF[2 * c + 1] = Ch;
    BBUF[2 * d] = Dl;
    BBUF[2 * d + 1] = Dh;
  }
  function G2b(a, b, c, d, msg, x) {
    const Xl = msg[x], Xh = msg[x + 1];
    let Al = BBUF[2 * a], Ah = BBUF[2 * a + 1];
    let Bl = BBUF[2 * b], Bh = BBUF[2 * b + 1];
    let Cl = BBUF[2 * c], Ch = BBUF[2 * c + 1];
    let Dl = BBUF[2 * d], Dh = BBUF[2 * d + 1];
    const ll = add3L(Al, Bl, Xl);
    Ah = add3H(ll, Ah, Bh, Xh);
    Al = ll | 0;
    let xh = Dh ^ Ah, xl = Dl ^ Al;
    Dh = rotrSH(xh, xl, 16);
    Dl = rotrSL(xh, xl, 16);
    ({ h: Ch, l: Cl } = add(Ch, Cl, Dh, Dl));
    xh = Bh ^ Ch;
    xl = Bl ^ Cl;
    Bh = rotrBH(xh, xl, 63);
    Bl = rotrBL(xh, xl, 63);
    BBUF[2 * a] = Al;
    BBUF[2 * a + 1] = Ah;
    BBUF[2 * b] = Bl;
    BBUF[2 * b + 1] = Bh;
    BBUF[2 * c] = Cl;
    BBUF[2 * c + 1] = Ch;
    BBUF[2 * d] = Dl;
    BBUF[2 * d + 1] = Dh;
  }
  function checkBlake2Opts(outputLen, opts = {}, keyLen, saltLen, persLen) {
    anumber(keyLen);
    if (outputLen <= 0 || outputLen > keyLen)
      throw new Error('"dkLen" must be 1..' + keyLen + ", got " + outputLen);
    const { key, salt, personalization } = opts;
    if (key !== void 0 && (key.length < 1 || key.length > keyLen))
      throw new Error('"key" expected to be undefined or of length=1..' + keyLen);
    if (salt !== void 0)
      abytes(salt, saltLen, "salt");
    if (personalization !== void 0)
      abytes(personalization, persLen, "personalization");
  }
  var B2B_IV, BBUF, _BLAKE2, _BLAKE2b, blake2b;
  var init_blake2 = __esm({
    "node_modules/@noble/hashes/blake2.js"() {
      init_blake();
      init_u64();
      init_utils();
      B2B_IV = /* @__PURE__ */ Uint32Array.from([
        4089235720,
        1779033703,
        2227873595,
        3144134277,
        4271175723,
        1013904242,
        1595750129,
        2773480762,
        2917565137,
        1359893119,
        725511199,
        2600822924,
        4215389547,
        528734635,
        327033209,
        1541459225
      ]);
      BBUF = /* @__PURE__ */ new Uint32Array(32);
      _BLAKE2 = class {
        buffer;
        buffer32;
        finished = false;
        destroyed = false;
        length = 0;
        pos = 0;
        blockLen;
        outputLen;
        canXOF = false;
        constructor(blockLen, outputLen) {
          anumber(blockLen);
          anumber(outputLen);
          this.blockLen = blockLen;
          this.outputLen = outputLen;
          this.buffer = new Uint8Array(blockLen);
          this.buffer32 = u32(this.buffer);
        }
        update(data) {
          aexists(this);
          abytes(data);
          const { blockLen, buffer, buffer32 } = this;
          const len = data.length;
          const offset = data.byteOffset;
          const buf = data.buffer;
          for (let pos = 0; pos < len; ) {
            if (this.pos === blockLen) {
              swap32IfBE(buffer32);
              this.compress(buffer32, 0, false);
              swap32IfBE(buffer32);
              this.pos = 0;
            }
            const take = Math.min(blockLen - this.pos, len - pos);
            const dataOffset = offset + pos;
            if (take === blockLen && !(dataOffset % 4) && pos + take < len) {
              const data32 = new Uint32Array(buf, dataOffset, Math.floor((len - pos) / 4));
              swap32IfBE(data32);
              for (let pos32 = 0; pos + blockLen < len; pos32 += buffer32.length, pos += blockLen) {
                this.length += blockLen;
                this.compress(data32, pos32, false);
              }
              swap32IfBE(data32);
              continue;
            }
            buffer.set(pos === 0 && take === len ? data : data.subarray(pos, pos + take), this.pos);
            this.pos += take;
            this.length += take;
            pos += take;
          }
          return this;
        }
        digestInto(out) {
          aexists(this);
          aoutput(out, this);
          if (out.byteOffset & 3)
            throw new RangeError('"output" expected 4-byte aligned byteOffset, got ' + out.byteOffset);
          const { pos, buffer32 } = this;
          this.finished = true;
          this.buffer.fill(0, pos);
          swap32IfBE(buffer32);
          this.compress(buffer32, 0, true);
          swap32IfBE(buffer32);
          const state = this.get();
          const out32 = out === this.buffer ? buffer32 : u32(out);
          const full = Math.floor(this.outputLen / 4);
          for (let i = 0; i < full; i++)
            out32[i] = swap8IfBE(state[i]);
          const tail = this.outputLen % 4;
          if (!tail)
            return;
          const off = full * 4;
          const word = state[full];
          for (let i = 0; i < tail; i++)
            out[off + i] = word >>> 8 * i;
        }
        digest() {
          const { buffer, outputLen } = this;
          this.digestInto(buffer);
          const res = buffer.slice(0, outputLen);
          this.destroy();
          return res;
        }
        _cloneInto(to) {
          const { buffer, length, finished: finished2, destroyed, outputLen, pos } = this;
          to ||= new this.constructor({ dkLen: outputLen });
          to.set(...this.get());
          to.buffer.set(buffer);
          to.destroyed = destroyed;
          to.finished = finished2;
          to.length = length;
          to.pos = pos;
          to.outputLen = outputLen;
          return to;
        }
        clone() {
          return this._cloneInto();
        }
      };
      _BLAKE2b = class extends _BLAKE2 {
        // Same IV words as SHA-512 / BLAKE2b, encoded as LE u32 low/high halves.
        v0l = B2B_IV[0] | 0;
        v0h = B2B_IV[1] | 0;
        v1l = B2B_IV[2] | 0;
        v1h = B2B_IV[3] | 0;
        v2l = B2B_IV[4] | 0;
        v2h = B2B_IV[5] | 0;
        v3l = B2B_IV[6] | 0;
        v3h = B2B_IV[7] | 0;
        v4l = B2B_IV[8] | 0;
        v4h = B2B_IV[9] | 0;
        v5l = B2B_IV[10] | 0;
        v5h = B2B_IV[11] | 0;
        v6l = B2B_IV[12] | 0;
        v6h = B2B_IV[13] | 0;
        v7l = B2B_IV[14] | 0;
        v7h = B2B_IV[15] | 0;
        constructor(opts = {}) {
          opts = checkOpts({}, opts);
          const olen = opts.dkLen === void 0 ? 64 : opts.dkLen;
          super(128, olen);
          checkBlake2Opts(olen, opts, 64, 16, 16);
          let { key, personalization, salt } = opts;
          let keyLength = 0;
          if (key !== void 0) {
            abytes(key, void 0, "key");
            keyLength = key.length;
          }
          this.v0l ^= this.outputLen | keyLength << 8 | 1 << 16 | 1 << 24;
          if (salt !== void 0) {
            abytes(salt, void 0, "salt");
            const slt = u32(copyBytes(salt));
            this.v4l ^= swap8IfBE(slt[0]);
            this.v4h ^= swap8IfBE(slt[1]);
            this.v5l ^= swap8IfBE(slt[2]);
            this.v5h ^= swap8IfBE(slt[3]);
          }
          if (personalization !== void 0) {
            abytes(personalization, void 0, "personalization");
            const pers = u32(copyBytes(personalization));
            this.v6l ^= swap8IfBE(pers[0]);
            this.v6h ^= swap8IfBE(pers[1]);
            this.v7l ^= swap8IfBE(pers[2]);
            this.v7h ^= swap8IfBE(pers[3]);
          }
          if (key !== void 0) {
            const tmp = new Uint8Array(this.blockLen);
            tmp.set(key);
            this.update(tmp);
            clean(tmp);
          }
        }
        // prettier-ignore
        get() {
          let { v0l, v0h, v1l, v1h, v2l, v2h, v3l, v3h, v4l, v4h, v5l, v5h, v6l, v6h, v7l, v7h } = this;
          return [v0l, v0h, v1l, v1h, v2l, v2h, v3l, v3h, v4l, v4h, v5l, v5h, v6l, v6h, v7l, v7h];
        }
        // prettier-ignore
        set(v0l, v0h, v1l, v1h, v2l, v2h, v3l, v3h, v4l, v4h, v5l, v5h, v6l, v6h, v7l, v7h) {
          this.v0l = v0l | 0;
          this.v0h = v0h | 0;
          this.v1l = v1l | 0;
          this.v1h = v1h | 0;
          this.v2l = v2l | 0;
          this.v2h = v2h | 0;
          this.v3l = v3l | 0;
          this.v3h = v3h | 0;
          this.v4l = v4l | 0;
          this.v4h = v4h | 0;
          this.v5l = v5l | 0;
          this.v5h = v5h | 0;
          this.v6l = v6l | 0;
          this.v6h = v6h | 0;
          this.v7l = v7l | 0;
          this.v7h = v7h | 0;
        }
        compress(msg, offset, isLast) {
          const { v0l, v0h, v1l, v1h, v2l, v2h, v3l, v3h, v4l, v4h, v5l, v5h, v6l, v6h, v7l, v7h } = this;
          {
            BBUF[0] = v0l;
            BBUF[1] = v0h;
            BBUF[2] = v1l;
            BBUF[3] = v1h;
            BBUF[4] = v2l;
            BBUF[5] = v2h;
            BBUF[6] = v3l;
            BBUF[7] = v3h;
            BBUF[8] = v4l;
            BBUF[9] = v4h;
            BBUF[10] = v5l;
            BBUF[11] = v5h;
            BBUF[12] = v6l;
            BBUF[13] = v6h;
            BBUF[14] = v7l;
            BBUF[15] = v7h;
          }
          BBUF.set(B2B_IV, 16);
          const l = fromNumL(this.length);
          const h = fromNumH(this.length);
          BBUF[24] = B2B_IV[8] ^ l;
          BBUF[25] = B2B_IV[9] ^ h;
          if (isLast) {
            BBUF[28] = ~BBUF[28];
            BBUF[29] = ~BBUF[29];
          }
          let j = 0;
          const s = BSIGMA;
          for (let i = 0; i < 12; i++) {
            G1b(0, 4, 8, 12, msg, offset + 2 * s[j++]);
            G2b(0, 4, 8, 12, msg, offset + 2 * s[j++]);
            G1b(1, 5, 9, 13, msg, offset + 2 * s[j++]);
            G2b(1, 5, 9, 13, msg, offset + 2 * s[j++]);
            G1b(2, 6, 10, 14, msg, offset + 2 * s[j++]);
            G2b(2, 6, 10, 14, msg, offset + 2 * s[j++]);
            G1b(3, 7, 11, 15, msg, offset + 2 * s[j++]);
            G2b(3, 7, 11, 15, msg, offset + 2 * s[j++]);
            G1b(0, 5, 10, 15, msg, offset + 2 * s[j++]);
            G2b(0, 5, 10, 15, msg, offset + 2 * s[j++]);
            G1b(1, 6, 11, 12, msg, offset + 2 * s[j++]);
            G2b(1, 6, 11, 12, msg, offset + 2 * s[j++]);
            G1b(2, 7, 8, 13, msg, offset + 2 * s[j++]);
            G2b(2, 7, 8, 13, msg, offset + 2 * s[j++]);
            G1b(3, 4, 9, 14, msg, offset + 2 * s[j++]);
            G2b(3, 4, 9, 14, msg, offset + 2 * s[j++]);
          }
          this.v0l ^= BBUF[0] ^ BBUF[16];
          this.v0h ^= BBUF[1] ^ BBUF[17];
          this.v1l ^= BBUF[2] ^ BBUF[18];
          this.v1h ^= BBUF[3] ^ BBUF[19];
          this.v2l ^= BBUF[4] ^ BBUF[20];
          this.v2h ^= BBUF[5] ^ BBUF[21];
          this.v3l ^= BBUF[6] ^ BBUF[22];
          this.v3h ^= BBUF[7] ^ BBUF[23];
          this.v4l ^= BBUF[8] ^ BBUF[24];
          this.v4h ^= BBUF[9] ^ BBUF[25];
          this.v5l ^= BBUF[10] ^ BBUF[26];
          this.v5h ^= BBUF[11] ^ BBUF[27];
          this.v6l ^= BBUF[12] ^ BBUF[28];
          this.v6h ^= BBUF[13] ^ BBUF[29];
          this.v7l ^= BBUF[14] ^ BBUF[30];
          this.v7h ^= BBUF[15] ^ BBUF[31];
          clean(BBUF);
        }
        destroy() {
          this.destroyed = true;
          clean(this.buffer32);
          this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        }
      };
      blake2b = /* @__PURE__ */ createHasher((opts) => new _BLAKE2b(opts));
    }
  });

  // core/sodium-noble.js
  var sodium_noble_exports = {};
  __export(sodium_noble_exports, {
    crypto_aead_chacha20poly1305_ietf_ABYTES: () => crypto_aead_chacha20poly1305_ietf_ABYTES,
    crypto_aead_chacha20poly1305_ietf_KEYBYTES: () => crypto_aead_chacha20poly1305_ietf_KEYBYTES,
    crypto_aead_chacha20poly1305_ietf_NPUBBYTES: () => crypto_aead_chacha20poly1305_ietf_NPUBBYTES,
    crypto_aead_chacha20poly1305_ietf_decrypt: () => crypto_aead_chacha20poly1305_ietf_decrypt,
    crypto_aead_chacha20poly1305_ietf_encrypt: () => crypto_aead_chacha20poly1305_ietf_encrypt,
    crypto_generichash: () => crypto_generichash,
    crypto_generichash_BYTES: () => crypto_generichash_BYTES,
    crypto_generichash_BYTES_MAX: () => crypto_generichash_BYTES_MAX,
    crypto_generichash_BYTES_MIN: () => crypto_generichash_BYTES_MIN,
    crypto_generichash_batch: () => crypto_generichash_batch,
    crypto_kx_PUBLICKEYBYTES: () => crypto_kx_PUBLICKEYBYTES,
    crypto_kx_SECRETKEYBYTES: () => crypto_kx_SECRETKEYBYTES,
    crypto_kx_SEEDBYTES: () => crypto_kx_SEEDBYTES,
    crypto_kx_keypair: () => crypto_kx_keypair,
    crypto_kx_seed_keypair: () => crypto_kx_seed_keypair,
    crypto_scalarmult: () => crypto_scalarmult,
    crypto_scalarmult_BYTES: () => crypto_scalarmult_BYTES,
    crypto_scalarmult_SCALARBYTES: () => crypto_scalarmult_SCALARBYTES,
    crypto_scalarmult_base: () => crypto_scalarmult_base,
    default: () => sodium_noble_default,
    randombytes_buf: () => randombytes_buf,
    sodium_memzero: () => sodium_memzero
  });
  function bytes(value, name) {
    if (!(value instanceof Uint8Array)) throw new TypeError(name + " must be bytes");
    return value;
  }
  function randombytes_buf(buffer) {
    bytes(buffer, "buffer");
    for (let offset = 0; offset < buffer.byteLength; offset += 65536) {
      globalThis.crypto.getRandomValues(buffer.subarray(offset, Math.min(buffer.byteLength, offset + 65536)));
    }
  }
  function sodium_memzero(buffer) {
    bytes(buffer, "buffer").fill(0);
  }
  function crypto_scalarmult_base(q, n) {
    bytes(q, "q").set(x25519.getPublicKey(bytes(n, "n")));
  }
  function crypto_scalarmult(q, n, p) {
    const shared = x25519.getSharedSecret(bytes(n, "n"), bytes(p, "p"));
    if (shared.every((byte) => byte === 0)) throw new Error("crypto_scalarmult: low-order point");
    bytes(q, "q").set(shared);
  }
  function crypto_kx_keypair(pk, sk) {
    randombytes_buf(bytes(sk, "sk").subarray(0, 32));
    crypto_scalarmult_base(bytes(pk, "pk"), sk.subarray(0, 32));
  }
  function crypto_kx_seed_keypair(pk, sk, seed) {
    bytes(sk, "sk").set(blake2b(bytes(seed, "seed"), { dkLen: 32 }));
    crypto_scalarmult_base(bytes(pk, "pk"), sk);
  }
  function crypto_aead_chacha20poly1305_ietf_encrypt(c, m, ad, nsec, npub, k) {
    const sealed = chacha20poly1305(bytes(k, "k"), bytes(npub, "npub"), ad ? bytes(ad, "ad") : void 0).encrypt(bytes(m, "m"));
    if (bytes(c, "c").byteLength !== sealed.byteLength) throw new RangeError("ciphertext buffer has the wrong length");
    c.set(sealed);
    return sealed.byteLength;
  }
  function crypto_aead_chacha20poly1305_ietf_decrypt(m, nsec, c, ad, npub, k) {
    const opened = chacha20poly1305(bytes(k, "k"), bytes(npub, "npub"), ad ? bytes(ad, "ad") : void 0).decrypt(bytes(c, "c"));
    if (bytes(m, "m").byteLength !== opened.byteLength) throw new RangeError("plaintext buffer has the wrong length");
    m.set(opened);
    return opened.byteLength;
  }
  function crypto_generichash(out, input, key) {
    bytes(out, "out").set(blake2b(bytes(input, "input"), { dkLen: out.byteLength, key: key ? bytes(key, "key") : void 0 }));
  }
  function crypto_generichash_batch(out, batch, key) {
    const hash2 = blake2b.create({ dkLen: bytes(out, "out").byteLength, key: key ? bytes(key, "key") : void 0 });
    for (const piece of batch) hash2.update(bytes(piece, "piece"));
    out.set(hash2.digest());
  }
  var crypto_kx_SEEDBYTES, crypto_kx_PUBLICKEYBYTES, crypto_kx_SECRETKEYBYTES, crypto_scalarmult_BYTES, crypto_scalarmult_SCALARBYTES, crypto_aead_chacha20poly1305_ietf_NPUBBYTES, crypto_aead_chacha20poly1305_ietf_ABYTES, crypto_aead_chacha20poly1305_ietf_KEYBYTES, crypto_generichash_BYTES, crypto_generichash_BYTES_MIN, crypto_generichash_BYTES_MAX, sodium_noble_default;
  var init_sodium_noble = __esm({
    "core/sodium-noble.js"() {
      init_ed25519();
      init_chacha();
      init_blake2();
      crypto_kx_SEEDBYTES = 32;
      crypto_kx_PUBLICKEYBYTES = 32;
      crypto_kx_SECRETKEYBYTES = 32;
      crypto_scalarmult_BYTES = 32;
      crypto_scalarmult_SCALARBYTES = 32;
      crypto_aead_chacha20poly1305_ietf_NPUBBYTES = 12;
      crypto_aead_chacha20poly1305_ietf_ABYTES = 16;
      crypto_aead_chacha20poly1305_ietf_KEYBYTES = 32;
      crypto_generichash_BYTES = 32;
      crypto_generichash_BYTES_MIN = 16;
      crypto_generichash_BYTES_MAX = 64;
      sodium_noble_default = {
        crypto_kx_SEEDBYTES,
        crypto_kx_PUBLICKEYBYTES,
        crypto_kx_SECRETKEYBYTES,
        crypto_scalarmult_BYTES,
        crypto_scalarmult_SCALARBYTES,
        crypto_aead_chacha20poly1305_ietf_NPUBBYTES,
        crypto_aead_chacha20poly1305_ietf_ABYTES,
        crypto_aead_chacha20poly1305_ietf_KEYBYTES,
        crypto_generichash_BYTES,
        crypto_generichash_BYTES_MIN,
        crypto_generichash_BYTES_MAX,
        randombytes_buf,
        sodium_memzero,
        crypto_scalarmult_base,
        crypto_scalarmult,
        crypto_kx_keypair,
        crypto_kx_seed_keypair,
        crypto_aead_chacha20poly1305_ietf_encrypt,
        crypto_aead_chacha20poly1305_ietf_decrypt,
        crypto_generichash,
        crypto_generichash_batch
      };
    }
  });

  // node_modules/noise-handshake/cipher.js
  var require_cipher = __commonJS({
    "node_modules/noise-handshake/cipher.js"(exports, module) {
      var sodium = (init_sodium_noble(), __toCommonJS(sodium_noble_exports));
      var b4a = require_browser();
      module.exports = class CipherState {
        constructor(key) {
          this.key = key || null;
          this.nonce = 0;
          this.CIPHER_ALG = "ChaChaPoly";
        }
        initialiseKey(key) {
          this.key = key;
          this.nonce = 0;
        }
        setNonce(nonce) {
          this.nonce = nonce;
        }
        encrypt(plaintext, ad) {
          if (!this.hasKey) return plaintext;
          if (!ad) ad = b4a.alloc(0);
          const ciphertext = encryptWithAD(this.key, this.nonce, ad, plaintext);
          if (ciphertext.length > 65535) throw new Error(`ciphertext length of ${ciphertext.length} exceeds maximum Noise message length of 65535`);
          this.nonce++;
          return ciphertext;
        }
        decrypt(ciphertext, ad) {
          if (!this.hasKey) return ciphertext;
          if (!ad) ad = b4a.alloc(0);
          if (ciphertext.length > 65535) throw new Error(`ciphertext length of ${ciphertext.length} exceeds maximum Noise message length of 65535`);
          const plaintext = decryptWithAD(this.key, this.nonce, ad, ciphertext);
          this.nonce++;
          return plaintext;
        }
        get hasKey() {
          return this.key !== null;
        }
        _clear() {
          sodium.sodium_memzero(this.key);
          this.key = null;
          this.nonce = null;
        }
        static get MACBYTES() {
          return 16;
        }
        static get NONCEBYTES() {
          return 8;
        }
        static get KEYBYTES() {
          return 32;
        }
      };
      function encryptWithAD(key, counter, additionalData, plaintext) {
        if (!b4a.isBuffer(additionalData)) additionalData = b4a.from(additionalData, "hex");
        if (!b4a.isBuffer(plaintext)) plaintext = b4a.from(plaintext, "hex");
        const nonce = b4a.alloc(sodium.crypto_aead_chacha20poly1305_ietf_NPUBBYTES);
        const view = new DataView(nonce.buffer, nonce.byteOffset, nonce.byteLength);
        view.setUint32(4, counter, true);
        const ciphertext = b4a.alloc(plaintext.byteLength + sodium.crypto_aead_chacha20poly1305_ietf_ABYTES);
        sodium.crypto_aead_chacha20poly1305_ietf_encrypt(ciphertext, plaintext, additionalData, null, nonce, key);
        return ciphertext;
      }
      function decryptWithAD(key, counter, additionalData, ciphertext) {
        if (!b4a.isBuffer(additionalData)) additionalData = b4a.from(additionalData, "hex");
        if (!b4a.isBuffer(ciphertext)) ciphertext = b4a.from(ciphertext, "hex");
        if (ciphertext.byteLength < sodium.crypto_aead_chacha20poly1305_ietf_ABYTES) throw new Error(`ciphertext length of ${ciphertext.byteLength} is shorter than the MAC`);
        const nonce = b4a.alloc(sodium.crypto_aead_chacha20poly1305_ietf_NPUBBYTES);
        const view = new DataView(nonce.buffer, nonce.byteOffset, nonce.byteLength);
        view.setUint32(4, counter, true);
        const plaintext = b4a.alloc(ciphertext.byteLength - sodium.crypto_aead_chacha20poly1305_ietf_ABYTES);
        sodium.crypto_aead_chacha20poly1305_ietf_decrypt(plaintext, null, ciphertext, additionalData, nonce, key);
        return plaintext;
      }
    }
  });

  // node_modules/noise-handshake/dh.js
  var require_dh = __commonJS({
    "node_modules/noise-handshake/dh.js"(exports, module) {
      var {
        crypto_kx_SEEDBYTES: crypto_kx_SEEDBYTES2,
        crypto_kx_keypair: crypto_kx_keypair2,
        crypto_kx_seed_keypair: crypto_kx_seed_keypair2,
        crypto_scalarmult_BYTES: crypto_scalarmult_BYTES2,
        crypto_scalarmult_SCALARBYTES: crypto_scalarmult_SCALARBYTES2,
        crypto_scalarmult: crypto_scalarmult2,
        crypto_scalarmult_base: crypto_scalarmult_base2
      } = (init_sodium_noble(), __toCommonJS(sodium_noble_exports));
      var assert = require_nanoassert();
      var b4a = require_browser();
      var DHLEN = crypto_scalarmult_BYTES2;
      var PKLEN = crypto_scalarmult_BYTES2;
      var SKLEN = crypto_scalarmult_SCALARBYTES2;
      var SEEDLEN = crypto_kx_SEEDBYTES2;
      var ALG = "25519";
      module.exports = {
        DHLEN,
        PKLEN,
        SKLEN,
        SEEDLEN,
        ALG,
        generateKeyPair,
        generateSeedKeyPair,
        dh
      };
      function generateKeyPair(privKey) {
        const keyPair = {};
        keyPair.secretKey = privKey || b4a.alloc(SKLEN);
        keyPair.publicKey = b4a.alloc(PKLEN);
        if (privKey) {
          crypto_scalarmult_base2(keyPair.publicKey, keyPair.secretKey);
        } else {
          crypto_kx_keypair2(keyPair.publicKey, keyPair.secretKey);
        }
        return keyPair;
      }
      function generateSeedKeyPair(seed) {
        assert(seed.byteLength === SKLEN);
        const keyPair = {};
        keyPair.secretKey = b4a.alloc(SKLEN);
        keyPair.publicKey = b4a.alloc(PKLEN);
        crypto_kx_seed_keypair2(keyPair.publicKey, keyPair.secretKey, seed);
        return keyPair;
      }
      function dh(publicKey, { secretKey }) {
        assert(secretKey.byteLength === SKLEN);
        assert(publicKey.byteLength === PKLEN);
        const output = b4a.alloc(DHLEN);
        crypto_scalarmult2(
          output,
          secretKey,
          publicKey
        );
        return output;
      }
    }
  });

  // node_modules/noise-handshake/hmac.js
  var require_hmac = __commonJS({
    "node_modules/noise-handshake/hmac.js"(exports, module) {
      var b4a = require_browser();
      var { sodium_memzero: sodium_memzero2, crypto_generichash: crypto_generichash2, crypto_generichash_batch: crypto_generichash_batch2 } = (init_sodium_noble(), __toCommonJS(sodium_noble_exports));
      var HASHLEN = 64;
      var BLOCKLEN = 128;
      var scratch = b4a.alloc(BLOCKLEN * 3);
      var HMACKey = scratch.subarray(BLOCKLEN * 0, BLOCKLEN * 1);
      var OuterKeyPad = scratch.subarray(BLOCKLEN * 1, BLOCKLEN * 2);
      var InnerKeyPad = scratch.subarray(BLOCKLEN * 2, BLOCKLEN * 3);
      module.exports = function hmac(out, batch, key) {
        if (key.byteLength > BLOCKLEN) {
          crypto_generichash2(HMACKey.subarray(0, HASHLEN), key);
          sodium_memzero2(HMACKey.subarray(HASHLEN));
        } else {
          HMACKey.set(key);
          sodium_memzero2(HMACKey.subarray(key.byteLength));
        }
        for (let i = 0; i < HMACKey.byteLength; i++) {
          OuterKeyPad[i] = 92 ^ HMACKey[i];
          InnerKeyPad[i] = 54 ^ HMACKey[i];
        }
        sodium_memzero2(HMACKey);
        crypto_generichash_batch2(out, [InnerKeyPad].concat(batch));
        sodium_memzero2(InnerKeyPad);
        crypto_generichash_batch2(out, [OuterKeyPad, out]);
        sodium_memzero2(OuterKeyPad);
      };
      module.exports.BYTES = HASHLEN;
      module.exports.KEYBYTES = BLOCKLEN;
    }
  });

  // node_modules/noise-handshake/hkdf.js
  var require_hkdf = __commonJS({
    "node_modules/noise-handshake/hkdf.js"(exports, module) {
      var hmacBlake2b = require_hmac();
      var b4a = require_browser();
      var HASHLEN = 64;
      module.exports = {
        hkdf,
        HASHLEN
      };
      function hkdf(salt, inputKeyMaterial, info = "", length = 2 * HASHLEN) {
        const pseudoRandomKey = hkdfExtract(salt, inputKeyMaterial);
        return hkdfExpand(pseudoRandomKey, info, length);
      }
      function hkdfExtract(salt, inputKeyMaterial) {
        const hmac = b4a.alloc(HASHLEN);
        return hmacDigest(hmac, salt, inputKeyMaterial);
      }
      function hkdfExpand(key, info, length) {
        const buffer = b4a.allocUnsafeSlow(length);
        const infoBuf = b4a.from(info);
        let prev = infoBuf;
        const result = [];
        for (let i = 0; i < length; i += HASHLEN) {
          const pos = b4a.from([i / HASHLEN + 1]);
          const out = buffer.subarray(i, i + HASHLEN);
          result.push(out);
          prev = hmacDigest(out, key, [prev, infoBuf, pos]);
        }
        return result;
      }
      function hmacDigest(out, key, input) {
        hmacBlake2b(out, input, key);
        return out;
      }
    }
  });

  // node_modules/noise-handshake/symmetric-state.js
  var require_symmetric_state = __commonJS({
    "node_modules/noise-handshake/symmetric-state.js"(exports, module) {
      var sodium = (init_sodium_noble(), __toCommonJS(sodium_noble_exports));
      var assert = require_nanoassert();
      var b4a = require_browser();
      var CipherState2 = require_cipher();
      var curve = require_dh();
      var { HASHLEN, hkdf } = require_hkdf();
      module.exports = class SymmetricState extends CipherState2 {
        constructor(opts = {}) {
          super();
          this.curve = opts.curve || curve;
          this.digest = b4a.alloc(HASHLEN);
          this.chainingKey = null;
          this.offset = 0;
          this.DH_ALG = this.curve.ALG;
        }
        mixHash(data) {
          accumulateDigest(this.digest, data);
        }
        mixKeyAndHash(key) {
          const [ck, tempH, tempK] = hkdf(this.chainingKey, key, "", 3 * HASHLEN);
          this.chainingKey = ck;
          this.mixHash(tempH);
          this.initialiseKey(tempK.subarray(0, 32));
        }
        mixKeyNormal(key) {
          const [ck, tempK] = hkdf(this.chainingKey, key);
          this.chainingKey = ck;
          this.initialiseKey(tempK.subarray(0, 32));
        }
        mixKey(remoteKey, localKey) {
          const dh = this.curve.dh(remoteKey, localKey);
          const hkdfResult = hkdf(this.chainingKey, dh);
          this.chainingKey = hkdfResult[0];
          this.initialiseKey(hkdfResult[1].subarray(0, 32));
        }
        encryptAndHash(plaintext) {
          const ciphertext = this.encrypt(plaintext, this.digest);
          accumulateDigest(this.digest, ciphertext);
          return ciphertext;
        }
        decryptAndHash(ciphertext) {
          const plaintext = this.decrypt(ciphertext, this.digest);
          accumulateDigest(this.digest, ciphertext);
          return plaintext;
        }
        getHandshakeHash(out) {
          if (!out) return this.getHandshakeHash(b4a.alloc(HASHLEN));
          assert(out.byteLength === HASHLEN, `output must be ${HASHLEN} bytes`);
          out.set(this.digest);
          return out;
        }
        split() {
          const res = hkdf(this.chainingKey, b4a.alloc(0));
          return res.map((k) => k.subarray(0, 32));
        }
        _clear() {
          super._clear();
          sodium.sodium_memzero(this.digest);
          sodium.sodium_memzero(this.chainingKey);
          this.digest = null;
          this.chainingKey = null;
          this.offset = null;
          this.curve = null;
        }
        static get alg() {
          return CipherState2.alg + "_BLAKE2b";
        }
      };
      function accumulateDigest(digest, input) {
        const toHash = b4a.concat([digest, input]);
        sodium.crypto_generichash(digest, toHash);
      }
    }
  });

  // node_modules/noise-handshake/noise.js
  var require_noise = __commonJS({
    "node_modules/noise-handshake/noise.js"(exports, module) {
      var assert = require_nanoassert();
      var b4a = require_browser();
      var SymmetricState = require_symmetric_state();
      var { HASHLEN } = require_hkdf();
      var PRESHARE_IS = /* @__PURE__ */ Symbol("initiator static key preshared");
      var PRESHARE_RS = /* @__PURE__ */ Symbol("responder static key preshared");
      var TOK_PSK = /* @__PURE__ */ Symbol("psk");
      var TOK_S = /* @__PURE__ */ Symbol("s");
      var TOK_E = /* @__PURE__ */ Symbol("e");
      var TOK_ES = /* @__PURE__ */ Symbol("es");
      var TOK_SE = /* @__PURE__ */ Symbol("se");
      var TOK_EE = /* @__PURE__ */ Symbol("ee");
      var TOK_SS = /* @__PURE__ */ Symbol("ss");
      var HANDSHAKES = Object.freeze({
        NN: [
          [TOK_E],
          [TOK_E, TOK_EE]
        ],
        NNpsk0: [
          [TOK_PSK, TOK_E],
          [TOK_E, TOK_EE]
        ],
        XX: [
          [TOK_E],
          [TOK_E, TOK_EE, TOK_S, TOK_ES],
          [TOK_S, TOK_SE]
        ],
        XXpsk0: [
          [TOK_PSK, TOK_E],
          [TOK_E, TOK_EE, TOK_S, TOK_ES],
          [TOK_S, TOK_SE]
        ],
        IK: [
          PRESHARE_RS,
          [TOK_E, TOK_ES, TOK_S, TOK_SS],
          [TOK_E, TOK_EE, TOK_SE]
        ],
        XK: [
          PRESHARE_RS,
          [TOK_E, TOK_ES],
          [TOK_E, TOK_EE],
          [TOK_S, TOK_SE]
        ]
      });
      var Writer = class {
        constructor() {
          this.size = 0;
          this.buffers = [];
        }
        push(b) {
          this.size += b.byteLength;
          this.buffers.push(b);
        }
        end() {
          const all = b4a.alloc(this.size);
          let offset = 0;
          for (const b of this.buffers) {
            all.set(b, offset);
            offset += b.byteLength;
          }
          return all;
        }
      };
      var Reader = class {
        constructor(buf) {
          this.offset = 0;
          this.buffer = buf;
        }
        shift(n) {
          const start2 = this.offset;
          const end = this.offset += n;
          if (end > this.buffer.byteLength) throw new Error("Insufficient bytes");
          return this.buffer.subarray(start2, end);
        }
        end() {
          return this.shift(this.buffer.byteLength - this.offset);
        }
      };
      module.exports = class NoiseState extends SymmetricState {
        constructor(pattern, initiator, staticKeypair, opts = {}) {
          super(opts);
          this.s = staticKeypair || this.curve.generateKeyPair();
          this.e = null;
          this.psk = null;
          if (opts && opts.psk) this.psk = opts.psk;
          this.re = null;
          this.rs = null;
          this.pattern = pattern;
          this.handshake = HANDSHAKES[this.pattern].slice();
          this.isPskHandshake = !!this.psk && hasPskToken(this.handshake);
          this.protocol = b4a.from([
            "Noise",
            this.pattern,
            this.DH_ALG,
            this.CIPHER_ALG,
            "BLAKE2b"
          ].join("_"));
          this.initiator = initiator;
          this.complete = false;
          this.rx = null;
          this.tx = null;
          this.hash = null;
        }
        initialise(prologue, remoteStatic) {
          if (this.protocol.byteLength <= HASHLEN) this.digest.set(this.protocol);
          else this.mixHash(this.protocol);
          this.chainingKey = b4a.from(this.digest);
          this.mixHash(prologue);
          while (!Array.isArray(this.handshake[0])) {
            const message = this.handshake.shift();
            assert(
              message === PRESHARE_RS || message === PRESHARE_IS,
              "Unexpected pattern"
            );
            const takeRemoteKey = this.initiator ? message === PRESHARE_RS : message === PRESHARE_IS;
            if (takeRemoteKey) this.rs = remoteStatic;
            const key = takeRemoteKey ? this.rs : this.s.publicKey;
            assert(key != null, "Remote pubkey required");
            this.mixHash(key);
          }
        }
        final() {
          const [k1, k2] = this.split();
          this.tx = this.initiator ? k1 : k2;
          this.rx = this.initiator ? k2 : k1;
          this.complete = true;
          this.hash = this.getHandshakeHash();
          this._clear();
        }
        recv(buf) {
          const r = new Reader(buf);
          for (const pattern of this.handshake.shift()) {
            switch (pattern) {
              case TOK_PSK:
                this.mixKeyAndHash(this.psk);
                break;
              case TOK_E:
                this.re = r.shift(this.curve.PKLEN);
                this.mixHash(this.re);
                if (this.isPskHandshake) this.mixKeyNormal(this.re);
                break;
              case TOK_S: {
                const klen = this.hasKey ? this.curve.PKLEN + 16 : this.curve.PKLEN;
                this.rs = this.decryptAndHash(r.shift(klen));
                break;
              }
              case TOK_EE:
              case TOK_ES:
              case TOK_SE:
              case TOK_SS: {
                const useStatic = keyPattern(pattern, this.initiator);
                const localKey = useStatic.local ? this.s : this.e;
                const remoteKey = useStatic.remote ? this.rs : this.re;
                this.mixKey(remoteKey, localKey);
                break;
              }
              default:
                throw new Error("Unexpected message");
            }
          }
          const payload = this.decryptAndHash(r.end());
          if (!this.handshake.length) this.final();
          return payload;
        }
        send(payload = b4a.alloc(0)) {
          const w = new Writer();
          for (const pattern of this.handshake.shift()) {
            switch (pattern) {
              case TOK_PSK:
                this.mixKeyAndHash(this.psk);
                break;
              case TOK_E:
                if (this.e === null) this.e = this.curve.generateKeyPair();
                this.mixHash(this.e.publicKey);
                if (this.isPskHandshake) this.mixKeyNormal(this.e.publicKey);
                w.push(this.e.publicKey);
                break;
              case TOK_S:
                w.push(this.encryptAndHash(this.s.publicKey));
                break;
              case TOK_ES:
              case TOK_SE:
              case TOK_EE:
              case TOK_SS: {
                const useStatic = keyPattern(pattern, this.initiator);
                const localKey = useStatic.local ? this.s : this.e;
                const remoteKey = useStatic.remote ? this.rs : this.re;
                this.mixKey(remoteKey, localKey);
                break;
              }
              default:
                throw new Error("Unexpected message");
            }
          }
          w.push(this.encryptAndHash(payload));
          const response = w.end();
          if (!this.handshake.length) this.final();
          return response;
        }
        _clear() {
          super._clear();
          this.e.secretKey.fill(0);
          this.e.publicKey.fill(0);
          this.re.fill(0);
          this.e = null;
          this.re = null;
        }
      };
      function keyPattern(pattern, initiator) {
        const ret = {
          local: false,
          remote: false
        };
        switch (pattern) {
          case TOK_EE:
            return ret;
          case TOK_ES:
            ret.local ^= !initiator;
            ret.remote ^= initiator;
            return ret;
          case TOK_SE:
            ret.local ^= initiator;
            ret.remote ^= !initiator;
            return ret;
          case TOK_SS:
            ret.local ^= 1;
            ret.remote ^= 1;
            return ret;
        }
      }
      function hasPskToken(handshake) {
        return handshake.some((x) => {
          return Array.isArray(x) && x.indexOf(TOK_PSK) !== -1;
        });
      }
    }
  });

  // core/link-core.js
  var import_noise_handshake = __toESM(require_noise(), 1);
  var import_cipher = __toESM(require_cipher(), 1);
  init_sodium_noble();
  var LINK_VERSION = 1;
  var KEY_BYTES = 32;
  var CHANNEL_BYTES = 32;
  var PSK_BYTES = 32;
  var REQUEST_ID_BYTES = 16;
  var MAX_FRAME_BODY = 48 * 1024;
  var MAX_CONTROL_BYTES = 16 * 1024;
  var MAX_FRAMES_PER_DIRECTION = 2 ** 31;
  var KIND_REQUEST = 1;
  var KIND_RESPONSE = 2;
  var KIND_CONTROL = 3;
  var HEADER_BYTES = 1 + REQUEST_ID_BYTES + 4 + 1;
  var LinkError = class extends Error {
    constructor(code, message) {
      super(message || code);
      this.code = code;
    }
  };
  var encoder = new TextEncoder();
  var decoder = new TextDecoder("utf-8", { fatal: true });
  function utf8(text) {
    return encoder.encode(text);
  }
  function fromUtf8(bytes2) {
    return decoder.decode(bytes2);
  }
  function concat(...parts) {
    let size = 0;
    for (const part of parts) size += part.byteLength;
    const out = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      out.set(part, offset);
      offset += part.byteLength;
    }
    return out;
  }
  function copyBytes4(bytes2) {
    return new Uint8Array(bytes2);
  }
  function equalBytes2(a, b) {
    if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array) || a.byteLength !== b.byteLength) return false;
    let difference = 0;
    for (let i = 0; i < a.byteLength; i++) difference |= a[i] ^ b[i];
    return difference === 0;
  }
  function randomBytes4(length) {
    const out = new Uint8Array(length);
    for (let offset = 0; offset < length; offset += 65536) {
      globalThis.crypto.getRandomValues(out.subarray(offset, Math.min(length, offset + 65536)));
    }
    return out;
  }
  var B64U = /^[A-Za-z0-9_-]*$/;
  function toB64u(bytes2) {
    let binary = "";
    for (let i = 0; i < bytes2.byteLength; i++) binary += String.fromCharCode(bytes2[i]);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function fromB64u(text, length) {
    if (typeof text !== "string" || !B64U.test(text) || text.length % 4 === 1) throw new LinkError("bad-base64url");
    const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - text.length % 4) % 4);
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    if (toB64u(out) !== text) throw new LinkError("bad-base64url");
    if (length !== void 0 && out.byteLength !== length) throw new LinkError("bad-length");
    return out;
  }
  function toHex(bytes2) {
    let out = "";
    for (let i = 0; i < bytes2.byteLength; i++) out += bytes2[i].toString(16).padStart(2, "0");
    return out;
  }
  function hash(outLength, ...parts) {
    const out = new Uint8Array(outLength);
    sodium_noble_default.crypto_generichash(out, concat(...parts));
    return out;
  }
  function roomFromPsk(psk) {
    return toHex(hash(16, utf8("askrigor-phone-link/1 room\n"), checkLength(psk, PSK_BYTES, "psk")));
  }
  function sixDigits(handshakeHash) {
    const digest = hash(32, utf8("askrigor-phone-link/1 sas\n"), handshakeHash);
    const number = (digest[0] << 24 >>> 0) + (digest[1] << 16) + (digest[2] << 8) + digest[3];
    return String(number % 1e6).padStart(6, "0");
  }
  function pairPrologue(room) {
    return utf8("askrigor-phone-link/1 pair\n" + room);
  }
  function sessionPrologue(channel) {
    return concat(utf8("askrigor-phone-link/1 session\n"), checkLength(channel, CHANNEL_BYTES, "channel"));
  }
  function parsePairFragment(fragment) {
    const match = /^#?pair=(\d+)\.([A-Za-z0-9_-]+)$/.exec(fragment || "");
    if (!match) throw new LinkError("bad-pair-link", "This is not a pairing link.");
    if (Number(match[1]) !== LINK_VERSION) throw new LinkError("pair-version", "This pairing link is for another version of the phone page.");
    const bytes2 = fromB64u(match[2], KEY_BYTES + PSK_BYTES);
    return { laptopKey: bytes2.slice(0, KEY_BYTES), psk: bytes2.slice(KEY_BYTES) };
  }
  function checkLength(bytes2, length, name) {
    if (!(bytes2 instanceof Uint8Array) || bytes2.byteLength !== length) throw new LinkError("bad-" + name.replace(/ /g, "-"));
    return bytes2;
  }
  function newKeyPair() {
    const publicKey = new Uint8Array(KEY_BYTES);
    const secretKey = new Uint8Array(KEY_BYTES);
    sodium_noble_default.crypto_kx_keypair(publicKey, secretKey);
    return { publicKey, secretKey };
  }
  function payloadBytes(value) {
    const bytes2 = utf8(JSON.stringify(value === void 0 ? {} : value));
    if (bytes2.byteLength > MAX_CONTROL_BYTES) throw new LinkError("payload-too-big");
    return bytes2;
  }
  function payloadValue(bytes2) {
    if (bytes2.byteLength === 0) return {};
    let value;
    try {
      value = JSON.parse(fromUtf8(bytes2));
    } catch {
      throw new LinkError("bad-payload");
    }
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new LinkError("bad-payload");
    return value;
  }
  function finished(state) {
    if (!state.complete) throw new LinkError("handshake-unfinished");
    return { transport: new Transport(state.tx, state.rx), handshakeHash: copyBytes4(state.hash) };
  }
  var noPreparation = { async prepare() {
  }, curve: void 0 };
  var PhonePairing = class {
    constructor({ psk, room, laptopKey, phoneKeyPair, keyHelper = noPreparation }) {
      this.laptopKey = checkLength(laptopKey, KEY_BYTES, "laptop key");
      this.helper = keyHelper;
      this.state = new import_noise_handshake.default("XXpsk0", true, phoneKeyPair, { psk: checkLength(psk, PSK_BYTES, "psk"), curve: keyHelper.curve });
      this.state.initialise(pairPrologue(room));
      this.step = 0;
    }
    first(payload) {
      step(this, 0);
      return this.state.send(payloadBytes(payload));
    }
    // The laptop's reply: its static key must be the one the QR code gave.
    second(message) {
      step(this, 1);
      const payload = this.state.recv(copyBytes4(message));
      if (!equalBytes2(this.state.rs, this.laptopKey)) throw new LinkError("not-your-laptop", "The laptop that answered is not the one whose code you scanned.");
      return payloadValue(payload);
    }
    async third(payload) {
      step(this, 2);
      await this.helper.prepare([this.state.re]);
      const message = this.state.send(payloadBytes(payload));
      return { message, ...finished(this.state) };
    }
  };
  var PhoneSession = class {
    constructor({ channel, laptopKey, phoneKeyPair, keyHelper = noPreparation }) {
      this.laptopKey = checkLength(laptopKey, KEY_BYTES, "laptop key");
      this.helper = keyHelper;
      this.state = new import_noise_handshake.default("IK", true, phoneKeyPair, { curve: keyHelper.curve });
      this.state.initialise(sessionPrologue(channel), this.laptopKey);
      this.step = 0;
    }
    async first(payload) {
      step(this, 0);
      await this.helper.prepare([this.laptopKey]);
      return this.state.send(payloadBytes(payload));
    }
    async second(message) {
      step(this, 1);
      if (!(message instanceof Uint8Array) || message.byteLength < KEY_BYTES) throw new LinkError("bad-handshake");
      const own = copyBytes4(message);
      await this.helper.prepare([own.subarray(0, KEY_BYTES)]);
      const payload = payloadValue(this.state.recv(own));
      return { payload, ...finished(this.state) };
    }
  };
  function step(handshake, expected) {
    if (handshake.step !== expected) throw new LinkError("handshake-order");
    handshake.step = expected + 1;
  }
  var Transport = class {
    constructor(tx, rx) {
      this.out = new import_cipher.default(copyBytes4(checkLength(tx, KEY_BYTES, "key")));
      this.in = new import_cipher.default(copyBytes4(checkLength(rx, KEY_BYTES, "key")));
      this.sent = 0;
      this.received = 0;
      this.closed = false;
    }
    seal(plaintext) {
      if (this.closed) throw new LinkError("closed");
      if (++this.sent > MAX_FRAMES_PER_DIRECTION) throw new LinkError("too-many-frames");
      return this.out.encrypt(plaintext);
    }
    // Throws on any frame that was changed, replayed, dropped before it or sent out of order.
    open(sealed) {
      if (this.closed) throw new LinkError("closed");
      if (!(sealed instanceof Uint8Array) || sealed.byteLength < 16) throw new LinkError("bad-frame");
      if (++this.received > MAX_FRAMES_PER_DIRECTION) throw new LinkError("too-many-frames");
      try {
        return this.in.decrypt(sealed);
      } catch {
        throw new LinkError("frame-did-not-open");
      }
    }
    close() {
      if (this.closed) return;
      this.closed = true;
      if (this.out.key) this.out.key.fill(0);
      if (this.in.key) this.in.key.fill(0);
      this.out.key = null;
      this.in.key = null;
    }
  };
  function controlFrame(message) {
    const body = utf8(JSON.stringify(message));
    if (body.byteLength > MAX_CONTROL_BYTES) throw new LinkError("control-too-big");
    return concat(Uint8Array.of(KIND_CONTROL), body);
  }
  function messageFrames(kind, id, body) {
    if (kind !== KIND_REQUEST && kind !== KIND_RESPONSE) throw new LinkError("bad-kind");
    checkLength(id, REQUEST_ID_BYTES, "request id");
    const frames = [];
    const count = Math.max(1, Math.ceil(body.byteLength / MAX_FRAME_BODY));
    for (let part = 0; part < count; part++) {
      const piece = body.subarray(part * MAX_FRAME_BODY, Math.min(body.byteLength, (part + 1) * MAX_FRAME_BODY));
      const header = new Uint8Array(HEADER_BYTES);
      header[0] = kind;
      header.set(id, 1);
      new DataView(header.buffer).setUint32(1 + REQUEST_ID_BYTES, part, false);
      header[HEADER_BYTES - 1] = part === count - 1 ? 1 : 0;
      frames.push(concat(header, piece));
    }
    return frames;
  }
  function parseFrame(plaintext) {
    if (!(plaintext instanceof Uint8Array) || plaintext.byteLength < 1) throw new LinkError("bad-frame");
    const kind = plaintext[0];
    if (kind === KIND_CONTROL) {
      if (plaintext.byteLength - 1 > MAX_CONTROL_BYTES) throw new LinkError("control-too-big");
      return { kind, message: payloadValue(plaintext.subarray(1)) };
    }
    if (kind !== KIND_REQUEST && kind !== KIND_RESPONSE) throw new LinkError("bad-kind");
    if (plaintext.byteLength < HEADER_BYTES) throw new LinkError("bad-frame");
    const flags = plaintext[HEADER_BYTES - 1];
    if (flags !== 0 && flags !== 1) throw new LinkError("bad-frame");
    const body = plaintext.subarray(HEADER_BYTES);
    if (body.byteLength > MAX_FRAME_BODY) throw new LinkError("frame-too-big");
    return {
      kind,
      id: plaintext.slice(1, 1 + REQUEST_ID_BYTES),
      part: new DataView(plaintext.buffer, plaintext.byteOffset).getUint32(1 + REQUEST_ID_BYTES, false),
      last: flags === 1,
      body
    };
  }
  var Assembler = class {
    constructor({ maxBytes, maxOpen }) {
      this.maxBytes = maxBytes;
      this.maxOpen = maxOpen;
      this.open = /* @__PURE__ */ new Map();
    }
    add(frame) {
      const key = toHex(frame.id);
      let entry = this.open.get(key);
      if (!entry) {
        if (frame.part !== 0) throw new LinkError("part-out-of-order");
        if (this.open.size >= this.maxOpen) throw new LinkError("too-many-open");
        entry = { next: 0, size: 0, pieces: [] };
        this.open.set(key, entry);
      }
      if (frame.part !== entry.next) throw new LinkError("part-out-of-order");
      if (!frame.last && frame.body.byteLength !== MAX_FRAME_BODY) throw new LinkError("short-part");
      entry.size += frame.body.byteLength;
      if (entry.size > this.maxBytes) throw new LinkError("message-too-big");
      entry.pieces.push(copyBytes4(frame.body));
      entry.next += 1;
      if (!frame.last) return null;
      this.open.delete(key);
      return { id: frame.id, body: concat(...entry.pieces) };
    }
    clear() {
      this.open.clear();
    }
  };
  function encodeJson(value) {
    return utf8(JSON.stringify(value));
  }
  function decodeJson(bytes2) {
    try {
      return JSON.parse(fromUtf8(bytes2));
    } catch {
      throw new LinkError("bad-json");
    }
  }

  // core/actions.js
  var REFUSED = "The phone can't do that. Use the runner's page on the laptop.";
  var MAX_REQUEST_BYTES = 128 * 1024;
  var Refusal = class extends Error {
    constructor(message = REFUSED, status = 403) {
      super(message);
      this.status = status;
    }
  };
  function plainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  }
  function keysWithin(value, allowed, required = []) {
    if (!plainObject(value)) throw new Refusal();
    for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Refusal();
    for (const key of required) if (!(key in value)) throw new Refusal();
  }
  function actionFromCall(path, body) {
    if (typeof path !== "string" || !path.startsWith("/api/") || path.length > 2048) throw new Refusal();
    const url = new URL(path, "http://runner.invalid");
    if (url.origin !== "http://runner.invalid" || url.hash) throw new Refusal();
    const query = {};
    for (const [name, value] of url.searchParams) {
      if (name in query) throw new Refusal();
      query[name] = value;
    }
    if (body === void 0) {
      switch (url.pathname) {
        case "/api/state":
          keysWithin(query, []);
          return { action: "state", args: {} };
        case "/api/runs":
          keysWithin(query, []);
          return { action: "runs", args: {} };
        case "/api/run":
          keysWithin(query, ["source", "folder"], ["source", "folder"]);
          return { action: "run", args: query };
        case "/api/job":
          keysWithin(query, ["id", "since"], ["id"]);
          return { action: "job", args: { id: query.id, since: query.since ?? "0" } };
      }
      throw new Refusal();
    }
    keysWithin(query, []);
    const actions = { "/api/start": "start", "/api/dig-deeper": "dig-deeper", "/api/settings": "settings", "/api/reply": "reply", "/api/stop": "stop" };
    if (!(url.pathname in actions)) throw new Refusal();
    return { action: actions[url.pathname], args: body };
  }

  // core/relay-seat.js
  var RELAY_VERSION = 1;
  var CLOSE = {
    bad: 4400,
    notAllowed: 4401,
    notHere: 4404,
    expired: 4408,
    replaced: 4409,
    roomOver: 4410,
    tooFast: 4429,
    full: 4503
  };
  function signedText(role, id, challenge) {
    return "askrigor-relay/" + RELAY_VERSION + "\n" + role + "\n" + id + "\n" + challenge;
  }
  var RelaySeat = class {
    constructor({ url, role, id, sign, WebSocketImpl, toB64u: toB64u2, handlers, joinTimeoutMs = 15e3 }) {
      this.url = url;
      this.role = role;
      this.id = id;
      this.sign = sign;
      this.WebSocketImpl = WebSocketImpl;
      this.toB64u = toB64u2;
      this.handlers = handlers;
      this.joinTimeoutMs = joinTimeoutMs;
      this.state = "new";
      this.socket = null;
      this.timer = null;
    }
    open() {
      if (this.state !== "new") throw new Error("a seat opens once");
      this.state = "hello";
      const socket = new this.WebSocketImpl(this.url);
      this.socket = socket;
      socket.binaryType = "arraybuffer";
      this.timer = setTimeout(() => this.close(1e3), this.joinTimeoutMs);
      socket.addEventListener("message", (event) => this.onMessage(event.data));
      socket.addEventListener("close", (event) => this.onClose(event.code));
      socket.addEventListener("error", () => {
      });
    }
    onMessage(data) {
      if (this.state === "closed") return;
      if (typeof data === "string") {
        let message;
        try {
          message = JSON.parse(data);
        } catch {
          return this.close(1e3);
        }
        if (this.state === "hello" && message.t === "hello" && message.v === RELAY_VERSION && typeof message.challenge === "string") {
          const join = { t: "join", v: RELAY_VERSION, role: this.role };
          if (this.role === "laptop" || this.role === "phone") join.chan = this.id;
          else join.room = this.id;
          if (this.role === "laptop" || this.role === "pair-host") {
            const { publicKey, signature } = this.sign(signedText(this.role, this.id, message.challenge));
            join.key = this.toB64u(publicKey);
            join.sig = this.toB64u(signature);
          }
          this.state = "joining";
          this.socket.send(JSON.stringify(join));
          return;
        }
        if (this.state === "joining" && message.t === "joined") {
          clearTimeout(this.timer);
          this.state = "joined";
          this.handlers.joined?.();
          return;
        }
        if (this.state === "joined" && message.t === "peer" && typeof message.here === "boolean") {
          this.handlers.peer?.(message.here);
          return;
        }
        return this.close(1e3);
      }
      if (this.state !== "joined") return this.close(1e3);
      this.handlers.frame?.(new Uint8Array(data));
    }
    onClose(code) {
      if (this.state === "closed") return;
      this.state = "closed";
      clearTimeout(this.timer);
      this.handlers.closed?.(code);
    }
    get bufferedAmount() {
      return this.socket ? this.socket.bufferedAmount : 0;
    }
    send(bytes2) {
      if (this.state !== "joined") return false;
      this.socket.send(bytes2);
      return true;
    }
    close(code = 1e3) {
      if (this.state === "closed") return;
      const socket = this.socket;
      this.onClose(code);
      try {
        socket?.close(code);
      } catch {
      }
    }
  };
  var Pacer = class {
    constructor({ frames = 4.5, frameBurst = 40, bytes: bytes2 = 250 * 1024, byteBurst = 2.5 * 1024 * 1024, maxBuffered = 512 * 1024, now = () => Date.now() } = {}) {
      this.rates = { frames, bytes: bytes2 };
      this.bursts = { frames: frameBurst, bytes: byteBurst };
      this.tokens = { frames: frameBurst, bytes: byteBurst };
      this.maxBuffered = maxBuffered;
      this.now = now;
      this.last = now();
      this.queue = [];
      this.queuedBytes = 0;
      this.running = false;
    }
    refill() {
      const now = this.now();
      const seconds = Math.max(0, now - this.last) / 1e3;
      this.last = now;
      for (const kind of ["frames", "bytes"]) this.tokens[kind] = Math.min(this.bursts[kind], this.tokens[kind] + seconds * this.rates[kind]);
    }
    // Queues plaintext frames; each is sealed (seal) only at the moment it is sent, so dropping queued frames never
    // leaves a gap in the transport's counters, and allowed() is asked again before each one (a phone unpaired or
    // past its date gets nothing more). Settles when every frame was handed to the socket, or rejects.
    push(frames, seat, { seal = (frame) => frame, allowed = () => true } = {}) {
      return new Promise((resolve, reject) => {
        for (const frame of frames) this.queuedBytes += frame.byteLength + 16;
        this.queue.push({ frames: frames.slice(), seat, seal, allowed, resolve, reject });
        if (!this.running) this.drain();
      });
    }
    async drain() {
      this.running = true;
      while (this.queue.length) {
        const job = this.queue[0];
        if (job.seat.state !== "joined" || !job.allowed()) {
          this.queue.shift();
          for (const frame2 of job.frames) this.queuedBytes -= frame2.byteLength + 16;
          job.reject(new Error("seat closed"));
          continue;
        }
        if (!job.frames.length) {
          this.queue.shift();
          job.resolve();
          continue;
        }
        const frame = job.frames[0];
        this.refill();
        const size = Math.min(frame.byteLength, this.bursts.bytes);
        if (this.tokens.frames < 1 || this.tokens.bytes < size || job.seat.bufferedAmount > this.maxBuffered) {
          await new Promise((resolve) => setTimeout(resolve, 25));
          continue;
        }
        this.tokens.frames -= 1;
        this.tokens.bytes -= size;
        job.frames.shift();
        this.queuedBytes -= frame.byteLength + 16;
        let sealed;
        try {
          sealed = job.seal(frame);
        } catch {
          sealed = null;
        }
        if (!sealed || !job.seat.send(sealed)) {
          this.queue.shift();
          for (const left of job.frames) this.queuedBytes -= left.byteLength + 16;
          job.reject(new Error("seat closed"));
        }
      }
      this.running = false;
    }
    clear() {
      for (const job of this.queue) job.reject(new Error("seat closed"));
      this.queue = [];
      this.queuedBytes = 0;
    }
  };

  // core/phone-client.js
  var REQUEST_TIMEOUT_MS = 45e3;
  var MAX_RESPONSE_BYTES = 8 * 1024 * 1024 + 4096;
  var MAX_IN_FLIGHT = 4;
  var MAX_QUEUED = 16;
  var MAX_ATTEMPTS = 3;
  var SAVED_WAIT_MS = 2e4;
  var READS = /* @__PURE__ */ new Set(["state", "runs", "run", "job"]);
  function backoff(attempt) {
    const steps = [1e3, 2e3, 5e3, 1e4, 3e4];
    const base = steps[Math.min(attempt, steps.length - 1)];
    return base + Math.floor(Math.random() * base * 0.3);
  }
  var LinkFailure = class extends Error {
    constructor(message, code) {
      super(message);
      this.code = code;
    }
  };
  var PhoneClient = class {
    constructor({ relayUrl: relayUrl2, WebSocketImpl, storage, keys, onState = () => {
    }, pageSha = "", device: device2 = "" }) {
      this.relayUrl = relayUrl2;
      this.WebSocketImpl = WebSocketImpl;
      this.storage = storage;
      this.keys = keys;
      this.onState = onState;
      this.pageSha = pageSha;
      this.device = String(device2).slice(0, 80);
      this.pairing = null;
      this.seat = null;
      this.session = null;
      this.transport = null;
      this.assembler = null;
      this.pacer = new Pacer();
      this.info = null;
      this.pending = /* @__PURE__ */ new Map();
      this.queue = [];
      this.attempt = 0;
      this.retry = null;
      this.paused = false;
      this.wanted = false;
      this.handshakeFailures = 0;
      this.state = "starting";
    }
    setState(state, detail = {}) {
      this.state = state;
      this.onState(state, detail);
    }
    async load() {
      await this.storage.clearPending?.();
      let record = await this.storage.load();
      if (record && record.tentative) {
        await this.storage.clear();
        record = null;
      }
      this.pairing = record;
      this.setState(this.pairing ? "paired" : "unpaired", this.pairing ? { laptopName: this.pairing.laptopName, expiresUtc: this.pairing.expiresUtc } : {});
      return this.pairing;
    }
    // ---- pairing ------------------------------------------------------------------------------------------------------
    pair({ laptopKey, psk }) {
      return new Promise((resolve, reject) => {
        this.disconnect();
        const room = roomFromPsk(psk);
        let handshake = null;
        let done = null;
        let record = null;
        let savedTimer = null;
        let finished2 = false;
        let committing = false;
        const pacer = new Pacer();
        const fail = (why, code = "pair-failed") => {
          if (finished2 || committing) return;
          finished2 = true;
          clearTimeout(savedTimer);
          psk.fill(0);
          pacer.clear();
          done?.transport.close();
          seat.close(1e3);
          if (record) this.storage.clearPending().catch(() => {
          });
          this.setState("pair-failed", { why });
          reject(new LinkFailure(why, code));
        };
        const seat = new RelaySeat({
          url: this.relayUrl,
          role: "pair-join",
          id: room,
          WebSocketImpl: this.WebSocketImpl,
          toB64u,
          handlers: {
            joined: () => this.setState("pairing", { step: "joined" }),
            peer: async (here) => {
              if (!here) return fail("The laptop stopped pairing. Start again on the laptop for a new code.");
              if (handshake) return;
              try {
                const phoneKey = await this.keys.newPhoneKey();
                const { keyPair, helper } = this.keys.phoneKeyHelper(phoneKey);
                handshake = new PhonePairing({ psk, room, laptopKey, phoneKeyPair: keyPair, keyHelper: helper });
                handshake.phoneKey = phoneKey;
                seat.send(handshake.first({ v: LINK_VERSION }));
              } catch {
                fail("Pairing failed on this phone.");
              }
            },
            frame: async (bytes2) => {
              try {
                if (handshake && !done) {
                  const hello = handshake.second(bytes2);
                  done = await handshake.third({ v: LINK_VERSION, device: this.device });
                  if (finished2) return done.transport.close();
                  psk.fill(0);
                  seat.send(done.message);
                  this.setState("pair-confirm", { sas: sixDigits(done.handshakeHash), laptopName: String(hello.name || "").slice(0, 80) });
                  return;
                }
                if (!done) throw new Error("unexpected");
                const frame = parseFrame(done.transport.open(bytes2));
                if (frame.kind !== KIND_CONTROL) throw new Error("unexpected");
                if (frame.message.t === "saved" && record) {
                  if (finished2 || committing) return;
                  committing = true;
                  clearTimeout(savedTimer);
                  try {
                    await this.storage.promote(record);
                  } catch {
                    committing = false;
                    return fail("This phone could not keep the pairing (its storage refused). Nothing usable was paired; the laptop lists a phone you can unpair there.");
                  }
                  finished2 = true;
                  this.pairing = record;
                  this.setState("paired", { laptopName: record.laptopName, expiresUtc: record.expiresUtc, justPaired: true });
                  setTimeout(() => {
                    done.transport.close();
                    seat.close(1e3);
                  }, 300);
                  resolve(record);
                  return;
                }
                if (frame.message.t !== "paired" || record) throw new Error("unexpected");
                const paired = frame.message;
                record = {
                  v: LINK_VERSION,
                  laptopKey,
                  phoneKey: handshake.phoneKey,
                  channel: fromB64u(paired.channel, CHANNEL_BYTES),
                  laptopName: String(paired.name || "Laptop").slice(0, 80),
                  phoneName: String(paired.phone_name || "").slice(0, 80),
                  expiresUtc: String(paired.expires_utc || ""),
                  pairedUtc: (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, "Z")
                };
                await this.storage.savePending(record);
                const transport = done.transport;
                await pacer.push([controlFrame({ t: "stored" })], seat, { seal: (frame2) => transport.seal(frame2) });
                this.setState("pairing", { step: "saving" });
                savedTimer = setTimeout(() => fail("The laptop did not confirm that it saved the pairing. Nothing was paired; start again on the laptop for a new code."), SAVED_WAIT_MS);
              } catch (error) {
                fail(error instanceof LinkFailure ? error.message : error.code === "not-your-laptop" ? "The laptop that answered is not the one whose code you scanned. Nothing was paired." : "Pairing failed: this phone and the laptop did not agree. Start again on the laptop for a new code.");
              }
            },
            closed: (code) => {
              if (finished2 || committing) return;
              fail(code === CLOSE.notHere ? "This pairing code is no longer open on the laptop (it works once, for 5 minutes). Start again on the laptop's Phone panel." : "The connection ended before pairing finished. Start again on the laptop for a new code.");
            }
          }
        });
        this.setState("pairing", { step: "connecting" });
        seat.open();
      });
    }
    // ---- the connection -------------------------------------------------------------------------------------------------
    connect() {
      this.wanted = true;
      if (!this.pairing || this.seat || this.paused) return;
      clearTimeout(this.retry);
      const pairing = this.pairing;
      let handshakeSent = false;
      this.setState("connecting", { laptopName: pairing.laptopName });
      const seat = new RelaySeat({
        url: this.relayUrl,
        role: "phone",
        id: toB64u(pairing.channel),
        WebSocketImpl: this.WebSocketImpl,
        toB64u,
        handlers: {
          peer: async (here) => {
            if (seat !== this.seat) return;
            if (!here) return seat.close(1e3);
            if (this.transport || this.session) this.endSession();
            try {
              const { keyPair, helper } = this.keys.phoneKeyHelper(pairing.phoneKey);
              this.session = new PhoneSession({ channel: pairing.channel, laptopKey: pairing.laptopKey, phoneKeyPair: keyPair, keyHelper: helper });
              const first = await this.session.first({ v: LINK_VERSION, page: this.pageSha });
              if (seat !== this.seat) return;
              handshakeSent = true;
              seat.send(first);
            } catch {
              seat.close(1e3);
            }
          },
          frame: (bytes2) => this.onFrame(seat, bytes2),
          closed: (code) => this.onClosed(seat, code, handshakeSent)
        }
      });
      this.seat = seat;
      seat.open();
    }
    async onFrame(seat, bytes2) {
      if (seat !== this.seat) return;
      try {
        if (!this.transport) {
          if (!this.session) throw new Error("unexpected");
          const session = this.session;
          const { payload, transport } = await session.second(bytes2);
          if (seat !== this.seat) return transport.close();
          this.session = null;
          if (payload.link !== LINK_VERSION) {
            transport.close();
            this.wanted = false;
            seat.close(1e3);
            return this.setState("update-needed", {});
          }
          this.transport = transport;
          this.assembler = new Assembler({ maxBytes: MAX_RESPONSE_BYTES, maxOpen: MAX_IN_FLIGHT * 2 });
          this.attempt = 0;
          this.handshakeFailures = 0;
          this.byeOff = false;
          this.info = {
            laptopName: String(payload.name || this.pairing.laptopName).slice(0, 80),
            runner: String(payload.runner || "").slice(0, 40),
            pageDiffers: Boolean(this.pageSha && payload.page && payload.page !== this.pageSha),
            expiresUtc: String(payload.expires_utc || this.pairing.expiresUtc)
          };
          this.setState("ready", this.info);
          this.pacer.push([controlFrame({ t: "hello" })], seat, { seal: (frame2) => transport.seal(frame2), allowed: () => transport === this.transport }).catch(() => {
          });
          this.pump();
          return;
        }
        const frame = parseFrame(this.transport.open(bytes2));
        for (const waiting of this.pending.values()) this.arm(waiting);
        if (frame.kind === KIND_CONTROL) {
          if (frame.message.t === "bye") {
            if (frame.message.why === "off") {
              this.attempt = Math.max(this.attempt, 3);
              this.byeOff = true;
            } else {
              this.wanted = false;
              this.setState(frame.message.why === "expired" ? "expired" : "laptop-closed", {});
            }
            seat.close(1e3);
          }
          return;
        }
        if (frame.kind !== KIND_RESPONSE) throw new Error("unexpected");
        const whole = this.assembler.add(frame);
        if (!whole) return;
        const entry = this.pending.get(toHex(whole.id));
        if (!entry) return;
        this.pending.delete(toHex(whole.id));
        clearTimeout(entry.timer);
        let answer;
        try {
          answer = decodeJson(whole.body);
        } catch {
          answer = { status: 502, body: { error: "The laptop's answer could not be read." } };
        }
        const body = answer && typeof answer.body === "object" && answer.body !== null ? answer.body : {};
        if (answer && answer.status >= 200 && answer.status < 300) entry.resolve(body);
        else entry.reject(new LinkFailure(body.error || "The laptop answered " + (answer && answer.status), "refused"));
        this.pump();
      } catch {
        seat.close(1e3);
      }
    }
    // Ends the current session (not the socket). Requests sent on it go again, with the same ids, on the next one (the
    // laptop answers a repeated change from memory instead of doing it twice); after MAX_ATTEMPTS they fail.
    endSession() {
      this.session = null;
      this.transport?.close();
      this.transport = null;
      this.assembler = null;
      this.pacer.clear();
      for (const entry of this.pending.values()) {
        clearTimeout(entry.timer);
        entry.attempts += 1;
        if (entry.attempts >= MAX_ATTEMPTS) {
          this.pending.delete(toHex(entry.id));
          entry.reject(new LinkFailure("The connection to the laptop dropped. Try again.", "dropped"));
        } else {
          this.pending.delete(toHex(entry.id));
          this.queue.unshift(entry);
        }
      }
    }
    onClosed(seat, code, handshakeSent) {
      if (seat !== this.seat) return;
      const wasReady = Boolean(this.transport);
      this.seat = null;
      this.endSession();
      if (!wasReady && handshakeSent) this.handshakeFailures += 1;
      if (!this.wanted || this.paused) return this.setState(this.paused ? "paused" : this.state, {});
      if (this.handshakeFailures >= 3) {
        this.setState("not-recognized", {});
      } else if (this.byeOff) {
        this.setState("laptop-off", { laptopName: this.pairing?.laptopName });
      } else if (code === CLOSE.notHere) {
        this.setState("laptop-offline", { laptopName: this.pairing?.laptopName });
      } else {
        this.setState("connecting", { laptopName: this.pairing?.laptopName });
      }
      const wait = this.handshakeFailures >= 3 ? 6e4 : backoff(this.attempt++);
      this.retry = setTimeout(() => this.connect(), wait);
    }
    disconnect() {
      this.wanted = false;
      clearTimeout(this.retry);
      const seat = this.seat;
      this.seat = null;
      this.session = null;
      this.transport?.close();
      this.transport = null;
      this.pacer.clear();
      seat?.close(1e3);
    }
    // The page went out of sight: no new requests; the socket closes after `afterMs`. Back in sight: connect again.
    pause(afterMs = 6e4) {
      this.paused = true;
      clearTimeout(this.pauseTimer);
      this.pauseTimer = setTimeout(() => {
        if (!this.paused) return;
        const wanted = this.wanted;
        this.disconnect();
        this.wanted = wanted;
        this.setState("paused", {});
      }, afterMs);
    }
    resume() {
      this.paused = false;
      clearTimeout(this.pauseTimer);
      if (this.wanted && !this.seat) this.connect();
    }
    // ---- requests ---------------------------------------------------------------------------------------------------------
    // The page's api(path, body): the same answers, or an Error with the same kind of message.
    request(path, body) {
      let action;
      try {
        action = actionFromCall(path, body);
      } catch (error) {
        return Promise.reject(new LinkFailure(error instanceof Refusal ? error.message : "The phone could not read that request.", "refused"));
      }
      if (!READS.has(action.action)) return this.send(action);
      const key = JSON.stringify(action);
      this.reading = this.reading || /* @__PURE__ */ new Map();
      const same = this.reading.get(key);
      if (same) return same;
      const promise = this.send(action).finally(() => this.reading.delete(key));
      this.reading.set(key, promise);
      return promise;
    }
    // `id` is for tests that repeat a request on purpose; the page never passes one.
    send(message, { id } = {}) {
      if (!this.pairing) return Promise.reject(new LinkFailure("This phone is not paired.", "unpaired"));
      if (this.paused) return Promise.reject(new LinkFailure("Paused while the page is out of sight.", "paused"));
      if (!this.transport) return Promise.reject(new LinkFailure("Not connected to your laptop right now.", "offline"));
      if (this.queue.length >= MAX_QUEUED) return Promise.reject(new LinkFailure("The phone is still waiting for earlier answers. Try again in a moment.", "busy"));
      return new Promise((resolve, reject) => {
        this.queue.push({ id: id || randomBytes4(16), message, resolve, reject, attempts: 0, timer: null });
        this.pump();
      });
    }
    pump() {
      while (this.transport && this.queue.length && this.pending.size < MAX_IN_FLIGHT) {
        const entry = this.queue.shift();
        const transport = this.transport;
        const frames = messageFrames(KIND_REQUEST, entry.id, encodeJson(entry.message));
        this.pending.set(toHex(entry.id), entry);
        this.arm(entry);
        this.pacer.push(frames, this.seat, { seal: (frame) => transport.seal(frame), allowed: () => transport === this.transport }).catch(() => {
        });
      }
    }
    // No frame of the answer for REQUEST_TIMEOUT_MS: the connection is presumed dead; closing it sends this request
    // again on the next. Every frame that arrives re-arms it, so a long answer that keeps coming is never cut.
    arm(entry) {
      clearTimeout(entry.timer);
      entry.timer = setTimeout(() => {
        if (this.pending.get(toHex(entry.id)) !== entry) return;
        this.seat?.close(1e3);
      }, REQUEST_TIMEOUT_MS);
    }
    async unpairSelf() {
      await this.send({ action: "unpair-self", args: {} });
      await this.forget();
    }
    // Deletes this phone's keys here only (the laptop keeps its side until it is unpaired there or its date passes).
    async forget() {
      this.disconnect();
      for (const entry of [...this.pending.values(), ...this.queue]) {
        clearTimeout(entry.timer);
        entry.reject(new LinkFailure("This phone is not paired.", "unpaired"));
      }
      this.pending.clear();
      this.queue = [];
      if (this.pairing?.phoneKey?.kind === "raw") this.pairing.phoneKey.secretKey.fill(0);
      this.pairing = null;
      await this.storage.clear();
      this.setState("unpaired", {});
    }
  };

  // core/phone-keys.js
  var import_dh = __toESM(require_dh(), 1);
  async function webCryptoX25519() {
    try {
      const pair = await globalThis.crypto.subtle.generateKey({ name: "X25519" }, false, ["deriveBits"]);
      return Boolean(pair && pair.privateKey && pair.privateKey.extractable === false);
    } catch {
      return false;
    }
  }
  async function newPhoneKey({ allowWebCrypto = true } = {}) {
    if (allowWebCrypto && await webCryptoX25519()) {
      const pair2 = await globalThis.crypto.subtle.generateKey({ name: "X25519" }, false, ["deriveBits"]);
      const publicKey = new Uint8Array(await globalThis.crypto.subtle.exportKey("raw", pair2.publicKey));
      if (publicKey.byteLength !== KEY_BYTES) throw new LinkError("bad-key");
      return { kind: "webcrypto", publicKey, privateKey: pair2.privateKey };
    }
    const pair = newKeyPair();
    return { kind: "raw", publicKey: pair.publicKey, secretKey: pair.secretKey };
  }
  function phoneKeyHelper(stored) {
    if (!stored || !(stored.publicKey instanceof Uint8Array) || stored.publicKey.byteLength !== KEY_BYTES) throw new LinkError("bad-key");
    if (stored.kind === "raw") return { keyPair: { publicKey: stored.publicKey, secretKey: stored.secretKey }, helper: void 0 };
    if (stored.kind !== "webcrypto" || !stored.privateKey) throw new LinkError("bad-key");
    const handle = new Uint8Array(KEY_BYTES);
    const ready = /* @__PURE__ */ new Map();
    const curve = Object.assign({}, import_dh.default, {
      dh(publicKey, keyPair) {
        if (keyPair.secretKey !== handle) return import_dh.default.dh(publicKey, keyPair);
        const value = ready.get(toHex(publicKey));
        if (!value) throw new LinkError("static-dh-not-prepared");
        ready.delete(toHex(publicKey));
        return value;
      }
    });
    const helper = {
      curve,
      async prepare(publicKeys) {
        for (const publicKey of publicKeys) {
          const remote = await globalThis.crypto.subtle.importKey("raw", new Uint8Array(publicKey), { name: "X25519" }, false, []);
          const bits = await globalThis.crypto.subtle.deriveBits({ name: "X25519", public: remote }, stored.privateKey, 256);
          ready.set(toHex(publicKey), new Uint8Array(bits));
        }
      }
    };
    return { keyPair: { publicKey: stored.publicKey, secretKey: handle }, helper };
  }

  // phone/storage.js
  var DB_NAME = "askrigor-phone-link";
  var STORE = "pairing";
  var KEY = "current";
  var PENDING = "pending";
  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function run(mode, work) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = work(transaction.objectStore(STORE));
        transaction.oncomplete = () => resolve(request.result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      db.close();
    }
  }
  var browserStorage = {
    async load() {
      const record = await run("readonly", (store) => store.get(KEY));
      return record && record.v === 1 ? record : null;
    },
    async save(record) {
      await run("readwrite", (store) => store.put(record, KEY));
      try {
        if (navigator.storage && navigator.storage.persist) await navigator.storage.persist();
      } catch {
      }
    },
    async clear() {
      await run("readwrite", (store) => store.delete(KEY));
    },
    // A pairing in progress, kept apart until the laptop confirms it saved its side: a failed new pairing never
    // touches the one this phone already has.
    async savePending(record) {
      await run("readwrite", (store) => store.put(record, PENDING));
    },
    async clearPending() {
      await run("readwrite", (store) => store.delete(PENDING));
    },
    // The commit: the new pairing becomes current and the pending copy goes, in one transaction (all or nothing).
    async promote(record) {
      await run("readwrite", (store) => {
        store.put(record, KEY);
        return store.delete(PENDING);
      });
      try {
        if (navigator.storage && navigator.storage.persist) await navigator.storage.persist();
      } catch {
      }
    }
  };
  async function storageIsKept() {
    try {
      return Boolean(navigator.storage && navigator.storage.persisted && await navigator.storage.persisted());
    } catch {
      return false;
    }
  }

  // phone/phone.js
  var PAGE_SHA = true ? "db6b275f7091830faa1ffa2950494ebcdcef6dc23a7d25eacf1c2889e964ae8c" : "";
  var RUNNER_COMMIT = true ? "d3358413cc73" : "";
  var $ = (id) => document.getElementById(id);
  var esc = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  function device() {
    const ua = navigator.userAgent || "";
    const system = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "a device";
    const browser = /Firefox\//.test(ua) ? "Firefox" : /EdgA?\//.test(ua) ? "Edge" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "a browser";
    return browser + " on " + system;
  }
  function day(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return date.getUTCDate() + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getUTCMonth()] + " " + date.getUTCFullYear();
  }
  var relayUrl = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/relay";
  var client = new PhoneClient({
    relayUrl,
    WebSocketImpl: WebSocket,
    storage: browserStorage,
    keys: { newPhoneKey, phoneKeyHelper },
    onState: (state, detail) => show(state, detail),
    pageSha: PAGE_SHA,
    device: device()
  });
  var booted = false;
  var bootFn = null;
  var lastDetail = {};
  function trust(keyKind) {
    return "AskRigor's relay passes your phone's and your laptop's messages sealed: it can't read or change them. But this page itself comes from askrigor.com each time it opens. Whoever controls that server could change it and, while it is open on this phone, use the link as you can: read past answers, change settings, start research up to the limits set on your laptop. " + (keyKind === "webcrypto" ? "This phone's key is kept by the browser's own cryptography, where page code can use it but can't read it out. That stops a changed page from copying the key to use elsewhere, but not from using it while it runs, passing it to another website, or leaving code in this browser that uses it later. " : keyKind === "raw" ? "This browser keeps the phone's key as ordinary data, so a changed page could copy it and use the link from anywhere. " : "Where the browser allows it, the phone's key is kept where page code can use it but can't read it out; a changed page could still use it while it runs, pass it to another website, or leave code in this browser that uses it later. ") + "If you ever think askrigor.com served a changed page, unpair this phone at the laptop: that ends every way of using it. Whoever holds this phone unlocked holds the runner too: the phone's screen lock is the lock. A lost phone: unpair it at the laptop; until then its pairing ends by itself on its date.";
  }
  function screen(html) {
    const box = $("phoneLink");
    box.hidden = false;
    box.innerHTML = '<div class="pl-card">' + html + "</div>";
    document.body.classList.add("pl-blocked");
    for (const button of box.querySelectorAll("button[data-do]")) button.addEventListener("click", () => act(button.dataset.do));
  }
  function clearScreen() {
    $("phoneLink").hidden = true;
    $("phoneLink").innerHTML = "";
    document.body.classList.remove("pl-blocked");
  }
  function statusLine(text, kind) {
    $("plStatus").innerHTML = '<span class="pl-dot ' + kind + '"></span>' + esc(text) + ' <button type="button" id="plMenu">Phone link</button>';
    $("plMenu").addEventListener("click", menu);
  }
  function show(state, detail) {
    lastDetail = Object.assign({}, lastDetail, detail);
    const name = esc(lastDetail.laptopName || "your laptop");
    switch (state) {
      case "starting":
        return;
      case "unpaired":
        statusLine("Not paired", "off");
        return screen("<h2>AskRigor runner on your phone</h2><p>This page reaches the runner on your laptop. It must be paired once, at the laptop:</p><ol><li>On the laptop, open the runner's page and press <b>Phone link</b>, then <b>Pair a phone</b>.</li><li>Scan the code it shows with this phone's camera. This page opens and pairs.</li><li>Type the six digits this phone then shows into the laptop's Phone panel.</li></ol><details><summary>What this link can and can't protect</summary><p>" + esc(trust(null)) + "</p></details>");
      case "pairing":
        statusLine("Pairing…", "wait");
        return screen('<h2>Pairing with your laptop…</h2><p class="muted">' + (detail.step === "saving" ? "The laptop is saving the pairing…" : detail.step === "joined" ? "Found the laptop. Agreeing on keys…" : "Connecting through AskRigor's relay…") + "</p>");
      case "pair-confirm":
        statusLine("Pairing…", "wait");
        return screen('<h2>Type these six digits on the laptop</h2><p class="pl-sas">' + esc(detail.sas.slice(0, 3) + " " + detail.sas.slice(3)) + "</p><p>Type them into the laptop's Phone panel and press <b>Pair this phone</b>. The laptop pairs only if they match the ones it worked out, so a device that answered the code instead of this phone can't get in.</p>");
      case "pair-failed":
        statusLine("Not paired", "off");
        return screen("<h2>Not paired</h2><p>" + esc(detail.why) + '</p><button type="button" data-do="reload">OK</button>');
      case "paired":
        if (detail.justPaired) {
          screen("<h2>Paired with " + name + '</h2><p>Add this page to your home screen: in Chrome, the menu ⋮, then <b>Add to Home screen</b> (or <b>Install app</b>).</p><p class="muted">The pairing lasts until ' + esc(day(detail.expiresUtc)) + `. Pair a second phone or browser at the laptop as a spare before you travel: if this browser's data is cleared, the pairing is gone until you are back at the laptop.</p><button type="button" data-do="open" class="primary">Open the runner</button>`);
          return;
        }
        client.connect();
        return;
      case "connecting":
        statusLine("Connecting to " + (lastDetail.laptopName || "your laptop") + "…", "wait");
        if (!booted) screen("<h2>Connecting to " + name + `…</h2><p class="muted">Through AskRigor's relay.</p>`);
        return;
      case "laptop-offline":
        statusLine((lastDetail.laptopName || "Your laptop") + " is not connected. Trying again…", "off");
        if (!booted) screen("<h2>" + name + " is not connected</h2><p>The laptop must be on, awake and online, with the runner's page running and the phone link switched on. This page keeps trying.</p>");
        return;
      case "laptop-off":
        statusLine("The phone link is switched off on the laptop. Trying again…", "off");
        if (!booted) screen("<h2>The phone link is switched off</h2><p>It was switched off on " + name + " (or its runner page stopped). This page keeps trying.</p>");
        return;
      case "not-recognized":
        statusLine("The laptop does not accept this phone", "bad");
        return screen('<h2>The laptop does not accept this phone</h2><p>It may have been unpaired there. Pair it again at the laptop, or forget the pairing here.</p><button type="button" data-do="forget">Forget the pairing on this phone</button> <button type="button" data-do="retry">Try again</button>');
      case "expired":
        statusLine("The pairing has ended", "bad");
        return screen(`<h2>This phone's pairing has ended</h2><p>Renew it on the laptop's Phone panel, then reload this page.</p><button type="button" data-do="reload">Reload</button>`);
      case "laptop-closed":
        statusLine("Unpaired at the laptop", "bad");
        return screen('<h2>This phone was unpaired at the laptop</h2><button type="button" data-do="forget">Forget the pairing on this phone</button>');
      case "update-needed":
        statusLine("Update needed", "bad");
        return screen(`<h2>This phone page and the laptop's runner don't match</h2><p>Reload this page. If it stays, the runner on the laptop needs the version that matches askrigor.com's phone page.</p><button type="button" data-do="reload">Reload</button>`);
      case "paused":
        statusLine("Paused while out of sight", "wait");
        return;
      case "ready":
        statusLine("Connected to " + (detail.laptopName || "your laptop"), "on");
        clearScreen();
        $("plBanner").hidden = !detail.pageDiffers;
        if (!booted && bootFn) {
          booted = true;
          bootFn();
        }
    }
  }
  async function act(what) {
    if (what === "reload") return location.reload();
    if (what === "open") {
      clearScreen();
      return client.connect();
    }
    if (what === "retry") {
      client.handshakeFailures = 0;
      return client.connect();
    }
    if (what === "forget") {
      await client.forget();
      return;
    }
    if (what === "unpair") {
      try {
        await client.unpairSelf();
      } catch (error) {
        screen("<h2>Not unpaired</h2><p>" + esc(error.message) + '</p><p>The laptop must be connected to unpair from here. You can also forget the pairing on this phone only; the laptop then keeps it until it is unpaired there or its date passes.</p><button type="button" data-do="forget">Forget on this phone only</button> <button type="button" data-do="close">Back</button>');
      }
      return;
    }
    if (what === "close") return client.state === "ready" ? clearScreen() : show(client.state, lastDetail);
  }
  async function menu() {
    const kept = await storageIsKept();
    const keyKind = client.pairing && client.pairing.phoneKey ? client.pairing.phoneKey.kind : null;
    const info = client.info || {};
    screen("<h2>Phone link</h2><p>" + (client.state === "ready" ? "Connected to " + esc(info.laptopName || "your laptop") + "." : "Not connected now.") + (info.expiresUtc ? " This phone's pairing lasts until " + esc(day(info.expiresUtc)) + "." : "") + "</p>" + (info.runner ? '<p class="muted">The laptop runs runner ' + esc(info.runner) + ". This page was built from runner " + esc(RUNNER_COMMIT || "?") + "." + (info.pageDiffers ? " They differ: most views work, some may look different." : "") + "</p>" : "") + '<p class="muted">' + (kept ? "This browser keeps the pairing when space runs low." : "This browser may clear the pairing when its storage runs low. Installing the page on the home screen helps.") + '</p><p class="muted">' + (keyKind === "webcrypto" ? "This phone's key is kept by the browser's own cryptography: page code can use it but can't copy it out." : "This browser keeps the phone's key as ordinary data that page code could copy.") + "</p><details><summary>What this link can and can't protect</summary><p>" + esc(trust(keyKind)) + '</p></details><p><button type="button" data-do="unpair" class="danger">Unpair this phone</button> <button type="button" data-do="close">Back</button></p>');
  }
  window.PhoneLink = {
    request: (path, body) => client.request(path, body),
    whenReady(fn) {
      bootFn = fn;
      if (client.state === "ready" && !booted) {
        booted = true;
        fn();
      }
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) client.pause(6e4);
    else client.resume();
  });
  async function start() {
    try {
      if (navigator.serviceWorker) for (const registration of await navigator.serviceWorker.getRegistrations()) registration.unregister();
    } catch {
    }
    const fragment = location.hash;
    if (fragment.startsWith("#pair=")) {
      history.replaceState(null, "", location.pathname);
      let parsed;
      try {
        parsed = parsePairFragment(fragment);
      } catch (error) {
        return show("pair-failed", { why: error.message || "This is not a pairing link." });
      }
      const existing = await browserStorage.load().catch(() => null);
      if (existing) {
        screen("<h2>Pair again?</h2><p>This phone is already paired with " + esc(existing.laptopName) + '. Pairing again replaces that pairing on this phone.</p><button type="button" id="plAgain" class="primary">Pair again</button> <button type="button" data-do="reload">Keep the current one</button>');
        $("plAgain").addEventListener("click", () => client.pair(parsed).catch(() => {
        }));
        return;
      }
      client.pair(parsed).catch(() => {
      });
      return;
    }
    const pairing = await client.load().catch(() => null);
    if (pairing) client.connect();
  }
  start();
})();
