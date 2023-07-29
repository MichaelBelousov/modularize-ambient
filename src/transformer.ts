import assert from "assert";
import ts from "typescript";

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

export default transformer;
