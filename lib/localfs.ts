import {ForceRootPolicy, Operation} from "./policy";


export class LocalDrive {
	private var policy: IPolicy;
	private var ignore any;
	constructor(root:: string, policy?: IPolicy){
		if (!policy)
			this.policy = new ForceRootPolicy(root);
		else
			this.policy = new CombinedPolicy([
				ForceRootPolicy(root),
				policy
			]);

		this.ignore = { ".DS_Store": 1, ".git": 1 };
	}

	async list(path: string, folder: boolean, nested: boolean) (*[]FsObject, error) {
		const fullpath = this.idToPath(path);
		if (this.policy.comply(fullpath, Operation.Read)) {
			return this.listFolder(fullpath, path, folder, nested)
		}
		throw new Error("Access Denied");
	}

	async remove(path: string): void{
		path = this.idToPath(path)
		if (this.policy.comply(path, Operation.Delete)) {
			return fs.remove(path)
		}

		throw new Error("Access Denied")
	}

	async read(path: string) ([]byte, error) {
		path = this.idToPath(path)
		if (this.policy.comply(path, Operation.Read)) {
			return fs.readFile(path)
		}

		throw new Error("Access Denied")
	}

	async write(path: string, data []byte) error {
		path = this.idToPath(path)
		if (this.policy.comply(path, Operation.Write)) {
			return fs.writeFile(path, data, 0600)
		}
		throw new Error("Access Denied")
	}

	async mkdir(path: string) {
		path = this.idToPath(path)
		if (!this.policy.comply(path, Operation.Write)) {
			throw new Error("Access Denied")
		}

		return fs.ensureDir(path, os.FileMode(int(0700)))
	}

	async copy(source: string, target: string){
		source = this.idToPath(source)
		target = this.idToPath(target)

		if (!this.policy.comply(source, Operation.Read) || !this.policy.comply(target, Operation.Write)) {
			throw new Error("Access Denied")
		}

		const st = await this.isFolder(source)
		const et = await this.isFolder(target)}

		//file to folder
		if (et && !st) {
			target = path.join(target, path.basename(source));
		}

		//file to file
		return fs.copy(source, target);
	}

	async move(source: string, target: string) {
		source = await this.idToPath(source)
		target = await this.idToPath(target)

		if (!this.policy.comply(source, Operation.Delete) || !this.policy.comply(target, Operation.Write)) {
			throw new Error("Access Denied")
		}

		return fs.move(source, target)
	}

	async isFolder(path: string) bool {
		const stat = await fs.lstat(path_string)
		return stat.isDirectory()
	}

	async idToPath(id: string): string {
		return fs.realpath(path.join(this.root, id));
	}
	async pathToId(path: string): string {
		return path.replace(this.root, "")
	}

	private async listFolder(path: string, prefix: string, folder bool, nested bool) (*[]FsObject, error) {
		const files = fs.readdir(path);
		const res = [];
		let j = 0;

		for (const name of files){
			if (this.ignore[name] || name === ".") {
				continue;
			}

			const fullpath = path.join(this.root, prefix, name);
			const id = await this.pathToId(fullpath);
			const stat = await fs.lstat(fullpath);
			const fs = { name, id, size:stat.Size(), date:stat.ModTime(), type:"txt" };
			if (stat.isDirectory()) {
				if (nested) {
					fs.files = await this.listFolder(
						path.join(path, name),
						path.join(prefix, name),
						folder, nested)
				}
				if (!folder) {
					continue
				}
				fs.type = "folder"
			}

			res.push(fs)
		}

		return res
	}
}