export enum TokenType {
    Modifier,
    string
}

export const JavaTokens: { [key: string]: TokenType; } = {
    'public': TokenType.Modifier,
    'protected': TokenType.Modifier,
    'private': TokenType.Modifier,

    'transient': TokenType.Modifier,
    'volatile': TokenType.Modifier,

    'abstract': TokenType.Modifier,
    'constructor': TokenType.Modifier,
    'synchronized': TokenType.Modifier,
    'native': TokenType.Modifier,
    'strictfp': TokenType.Modifier,
    'varargs': TokenType.Modifier,
    'synthetic': TokenType.Modifier,

    'static': TokenType.Modifier,
    'final': TokenType.Modifier,

    'interface': TokenType.Modifier,
    'enum': TokenType.Modifier,

    'declared-synchronized': TokenType.Modifier,
    'bridge': TokenType.Modifier
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