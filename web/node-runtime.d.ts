/** 开发服务与用户库脚本用到的 Node 类型。应用源码不引用本文件。 */

interface ImportMeta {
  url: string;
}

declare namespace NodeJS {
  interface ErrnoException extends Error {
    code?: string;
  }
}

declare class Buffer {
  length: number;
  toString(encoding: "utf8" | "base64"): string;
  static concat(list: Buffer[]): Buffer;
  static from(value: string, encoding: "utf8"): Buffer;
  static byteLength(value: string, encoding: "utf8"): number;
}

declare const process: {
  env: Record<string, string | undefined>;
  platform: string;
};

declare module "node:fs" {
  export interface Stats {
    size: number;
    isFile(): boolean;
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
  }
  export interface Dirent {
    name: string;
    isFile(): boolean;
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
  }
  export function existsSync(target: string): boolean;
  export function lstatSync(target: string): Stats;
  export function statSync(target: string): Stats;
  export function readdirSync(target: string, options: { withFileTypes: true }): Dirent[];
  export function readFileSync(target: string, encoding: "utf8"): string;
  export function mkdirSync(target: string, options?: { recursive?: boolean; mode?: number }): string | undefined;
  export function openSync(target: string, flags: string, mode?: number): number;
  export function writeSync(fd: number, data: string): number;
  export function closeSync(fd: number): void;
  export function chmodSync(target: string, mode: number): void;
}

declare module "node:os" {
  export function homedir(): string;
  export function tmpdir(): string;
}

declare module "node:path" {
  export interface ParsedPath {
    root: string;
  }
  export function resolve(...parts: string[]): string;
  export function join(...parts: string[]): string;
  export function relative(from: string, to: string): string;
  export function dirname(target: string): string;
  export function basename(target: string): string;
  export function parse(target: string): ParsedPath;
  export function isAbsolute(target: string): boolean;
  export const sep: string;
}

declare module "node:url" {
  export function fileURLToPath(url: string): string;
}

declare module "node:https" {
  interface IncomingMessage {
    statusCode?: number;
    headers?: Record<string, string | string[] | undefined>;
    on(event: "data", listener: (chunk: Buffer) => void): void;
    on(event: "end", listener: () => void): void;
    on(event: "error", listener: (error: Error) => void): void;
  }
  interface ClientRequest {
    on(event: "error", listener: (error: Error) => void): void;
    write(body: string): void;
    end(): void;
  }
  export function request(
    url: string,
    options: { method?: string; headers?: Record<string, string> },
    callback: (response: IncomingMessage) => void,
  ): ClientRequest;
}
