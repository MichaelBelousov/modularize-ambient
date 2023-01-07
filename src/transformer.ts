import assert from "assert";
import ts from "typescript";
import Yargs from "yargs";

const declarationFiltersToUpdaters = new Map<
  Pick<typeof ts, `is${string}` & keyof typeof ts>,
  Pick<typeof ts.factory, `update${string}` & keyof typeof ts.factory>
>(
    Object.entries(ts.factory)
      .map(([key, value]) => ({ key, match: /^update(?<name>\w+Declaration$)/.exec(key), updateFunc: value }))
      .filter(({ match }) => !!match)
      .map(({ match, updateFunc }) => {
        const name = match?.groups?.["name"];
        assert(name);
        return [ts[`is${name}` as keyof typeof ts] as any, updateFunc] as const;
      })
  );

const transformer: ts.TransformerFactory<ts.SourceFile> = (ctx) => (
  srcFile
) => {
  const undeclareVisitor = (node: ts.Node) => {
    const modifiersWithoutDeclare =
      ts.canHaveModifiers(node) ?
        node.modifiers?.filter(
          (m) => m.kind !== ts.SyntaxKind.DeclareKeyword
        ) as ts.Modifier[] | undefined : undefined;
    const modifiersHasDeclare =
      ts.canHaveDecorators(node) &&
      node.modifiers &&
      node.modifiers.length ===
      (modifiersWithoutDeclare as ts.ModifierLike[]).length;
    if (ts.isImportDeclaration(node)) {
      const moduleSpecifierText = (node.moduleSpecifier as ts.StringLiteral)
        .text;
      ts.factory.updateImportDeclaration(
        node,
        modifiersWithoutDeclare || [],
        node.importClause,
        ts.factory.createStringLiteral(moduleSpecifierText),
        node.assertClause
      );
    }
    if (modifiersHasDeclare) {
      for (const [isDeclX, updateDeclX] of declarationFiltersToUpdaters.entries()) {
        if (isDeclX) {
          return (updateDeclX as any)(node, ...Object.values(node));
        }
      }
    }
    return node;
    // TODO: handle re-exports (ts.isExportDeclaration)
  };
  const alteredFile = ts.visitNode(srcFile, (node) => ts.visitEachChild(node, undeclareVisitor, ctx));

  return ts.factory.updateSourceFile(alteredFile, [
    ts.factory.createModuleDeclaration(
      [ts.factory.createModifier(ts.SyntaxKind.DeclareKeyword)],
      ts.factory.createStringLiteral("name"),
      ts.factory.createModuleBlock(
        alteredFile.statements
      )
    ),
  ]);
};

function compile(fileNames: string[], options: ts.CompilerOptions): void {
  // Create a Program with an in-memory emit
  const createdFiles: Record<string, string> = {};
  const host = ts.createCompilerHost(options);
  host.writeFile = (fileName: string, contents: string) => createdFiles[fileName] = contents
  
  // Prepare and emit the d.ts files
  const program = ts.createProgram(fileNames, options, host);
  program.emit();

  // Loop through all the input files
  fileNames.forEach(file => {
    console.log("### JavaScript\n")
    console.log(host.readFile(file))

    console.log("### Type Definition\n")
    const dts = file.replace(".js", ".d.ts")
    console.log(createdFiles[dts])
  })
}

if (module === require.main) {
  const args = Yargs(process.argv.slice(2))
    .usage(
      [
        "Transform the specified source iModel into a new target iModel.",
        "You must set up a .env file to connect to an online iModel, see the .env.template file to do so.",
      ].join("\n")
    )
    .strict()
    .options({
      // used if the source iModel is a snapshot
      sourceFile: {
        desc: "The full path to the source iModel",
        type: "string",
        required: true,
      },
    })
    .parseSync();

  compile([args.sourceFile], {
    allowJs: true,
    declaration: true,
    emitDeclarationOnly: true,
    transformers: {
      before: [transformer(undefined as any)]
    } as any
  });
}
