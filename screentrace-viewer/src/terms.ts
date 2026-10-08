export const confidenceTerms={CONFIRMED:'已確認',INFERRED:'依證據推定',UNRESOLVED:'未解析',AMBIGUOUS:'有歧義'} as const;
export const decisionTerms={KEEP:'保留',REMOVE:'移除',UNDECIDED:'未確認',INHERITED_REMOVE:'隨畫面移除'} as const;
export const apiTerms={IN_USE:'使用中',REMOVABLE:'可移除',UNREFERENCED:'未被使用'} as const;
export const confidenceLabel=(value?:string):string=>confidenceTerms[value as keyof typeof confidenceTerms]||'待確認';
export const decisionTerm=(value:string):string=>decisionTerms[value as keyof typeof decisionTerms]||'未確認';
