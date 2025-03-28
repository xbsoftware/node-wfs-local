export interface IPolicy {
	comply(path: string, operation: Operation):boolean;
}

export enum Operation {
	Read = 1,
	Write
}

export interface IFsObject {
	value: string;
	id: string;
	size:number;
	date:number;
	type:string;
	data? : IFsObject[];
}

export interface IListConfig {
	skipFiles?:boolean;
	subFolders?:boolean;
	nested?:boolean;
	exclude?: (file:IFsObject) => boolean;
	include?: (file:IFsObject) => boolean;
}

export interface IDriveConfig {
	verbose?:boolean;
}

export interface IOperationConfig {
	preventNameCollision?: boolean;
}
