function isDialog(node) {
  const attributes = node.attributes;
  return (
    node.tag === 'dialog' ||
    attributes['aria-modal'] === 'true' ||
    /^(dialog|alertdialog)$/.test(attributes.role ?? '') ||
    /(^|\s)(modal|offcanvas)(\s|$)/.test(attributes.class ?? '')
  );
}
/**
 * A dialog that renders only under a condition starts closed, as on first load. The whole conditional
 * block around it is hidden — its fixed layer, its backdrop and siblings rendered under the same condition —
 * not just the element marked as the dialog. Its components stay in the graph.
 */
function closeConditionalDialogs(document) {
  const visit = (node, ancestors) => {
    if (typeof node === 'string') return;
    if (node.tag && node.guards?.length && isDialog(node)) {
      const key = JSON.stringify(node.guards);
      let root = node,
        parent = ancestors.at(-1),
        index = ancestors.length - 1;
      while (parent?.tag && JSON.stringify(parent.guards) === key) {
        root = parent;
        parent = ancestors[--index];
      }
      for (const sibling of parent?.children ?? [root]) {
        if (typeof sibling === 'string' || !sibling.tag || JSON.stringify(sibling.guards) !== key)
          continue;
        if (!/display:none!important/.test(sibling.attributes.style ?? ''))
          sibling.attributes.style = [sibling.attributes.style, 'display:none!important']
            .filter(Boolean)
            .join(';');
        sibling.attributes['data-st-condition'] = key;
      }
      return;
    }
    for (const child of node.children) visit(child, [...ancestors, node]);
  };
  visit(document, []);
  return document;
}

export { closeConditionalDialogs };
