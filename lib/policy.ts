export interface IPolicy {
	comply(path: string, operation: Operation):bool
}

export enum Operation {
	Read = 1,
	Write
}

export class CombinedPolicy implements IPolicy {
	constructor(){
		this._all = [];
	}
	comply(path: string, operation: Operation){
		for (one of this._all){
			if (!one.Comply(path, operation))
				return false;
		}
		return true;
	}
}

export class ReadOnlyPolicy implements IPolicy {
	comply(path:string, operation:Operation){
		if (operation === Operation.Read){
			return true;
		}

		return false;
	}
}

export class ForceRootPolicy implements IPolicy {
	constructor(root){
		this.root = root;
	}
	comply(path: string){
		if (path.indexOf(this.root) === 0){
			return true;
		}
		return false;
	}
}

export class AllowPolicy implements IPolicy {
	comply(){ return true; }
}


export class DenyPolicy implements IPolicy {
	comply(){ return false; }
}