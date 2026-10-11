export const decisionTerms={KEEP:'保留',REMOVE:'移除',UNDECIDED:'未確認',INHERITED_REMOVE:'隨畫面移除'} as const;
export const decisionTerm=(value:string):string=>decisionTerms[value as keyof typeof decisionTerms]||'未確認';
