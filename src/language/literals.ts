// Reference: https://source.android.com/devices/tech/dalvik/dex-format#access-flags
export const DalvikModifiers: { [key: string]: number; } = {
    'public':       0x0001,
    'private':      0x0002,
    'protected':    0x0004,
    'static':       0x0008,
    'final':        0x0010,
    'synchronized': 0x0020,
    'volatile':     0x0040,
    'bridge':       0x0040,
    'transient':    0x0080,
    'varargs':      0x0080,
    'native':       0x0100,
    'interface':    0x0200,
    'abstract':     0x0400,
    'strictfp':     0x0800,
    'synthetic':    0x1000,
    'annotation':   0x2000,
    'enum':         0x4000,

    'constructor':              0x10000,
    'declared-synchronized':    0x20000,
};

export const JavaPrimitiveTypes: { [key: string]: string; } = {
    'V': 'void',
    'Z': 'boolean',
    'B': 'byte',
    'S': 'short',
    'C': 'char',
    'I': 'int',
    'J': 'long',
    'F': 'float',
    'D': 'double',
};