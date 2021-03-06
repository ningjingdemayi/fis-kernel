/*
 * fis
 * http://fis.baidu.com/
 */

'use strict';

function getReleaseExt(ext){
    if(ext){
        var rExt = fis.config.get('roadmap.ext' + ext);
        if(rExt){
            ext = normalizeExt(rExt);
        }
    }
    return ext;
}

function normalizeExt(ext){
    if(ext[0] !== '.'){
        ext = '.' + ext;
    }
    return ext;
}

function normalizePath(path, reg, rExt){
    return path
        .replace(reg, '')
        .replace(/[:*?"<>|]/g, '_') + rExt;
}

function addHash(path, file){
    var rExt  = file.rExt,
        qRExt = fis.util.escapeReg(rExt),
        qExt = fis.util.escapeReg(file.ext),
        hash = file.getHash(),
        reg = new RegExp(qRExt + '$|' + qExt + '$', 'i');
    return path.replace(reg, '') + '_' + hash + rExt;
}

function getDomainsByPath(path){
    var domain = fis.config.get('roadmap.domain', {}), value = [];
    if(typeof domain === 'string'){
        value = domain.split(/\s*,\s*/);
    } else if(fis.util.is(domain, 'Array')) {
        value = domain;
    } else {
        fis.util.map(domain, function(pattern, domain){
            if((pattern === 'image' && fis.util.isImageFile(path)) || fis.util.glob(pattern, path)){
                if(typeof domain === 'string'){
                    value = domain.split(/\s*,\s*/);
                } else if(fis.util.is(domain, 'Array')){
                    value = domain;
                } else {
                    fis.log.warning('invalid domain [' + domain + '] of [roadmap.domain.' + pattern + ']');
                }
                return true;
            }
        });
    }
    return value;
}


function getDomain(path){
    var hash = fis.util.md5(path),
        domains = getDomainsByPath(path),
        len = domains.length,
        domain = '';
    if(len){
        domain = domains[hash.charCodeAt(0) % len];
    }
    return domain;
}

var File = Object.derive(function(){
    var _ = fis.util,
        info = _.pathinfo(arguments);
    _.map(info, this, true);
    var ext = info.ext,
        rExt = this.rExt = getReleaseExt(ext),
        realpath = this.realpath = _.realpathSafe(info.fullname),
        realpathNoExt = this.realpathNoExt = info.rest,
        root = fis.project.getProjectPath();
    
    if(_.isTextFile(rExt)) {
        this._isImage = false;
        this._isText = true;
        this.charset = null;
        switch(rExt){
            case '.js':
                this.isJsLike = true;
                this.useDomain = true;
                this.useHash = true;
                break;
            case '.css':
                this.isCssLike = true;
                this.useDomain = true;
                this.useHash = true;
                break;
            case '.html':
            case '.xhtml':
            case '.htm':
            case '.tpl':
            case '.php':
            case '.jsp':
            case '.asp':
                this.isHtmlLike = true;
            break;
        }
    } else {
        this._isImage = true;
        this._isText = false;
        this.useDomain = true;
        this.useHash = rExt !== '.ico';
    }
    
    this.isMod = false;
    this.requires = [];
    this.extras = {};
    this.useCompile = true;
    
    if(realpath.indexOf(root) === 0){
        //subpath
        var len = root.length, subpath;
        this.subpath = subpath = realpath.substring(len);
        this.subdirname = info.dirname.substring(len);
        this.subpathNoExt = realpathNoExt.substring(len);
        
        //roadmap
        fis.uri.roadmap(subpath, 'path', this);
        
        //release
        if(this.release === false){
            var self = this;
            Object.defineProperty(this, 'url', {
                enumerable : true,
                get : function(){
                    fis.log.error('unreleasable file [' + self.realpath + ']');
                }
            });
        } else {
            //release & url
            var reg = new RegExp(_.escapeReg(ext) + '$|' + _.escapeReg(rExt) + '$', 'i');
            var release;
            if(this.release){
                release = this.release.replace(/[\/\\]+/, '');
                if(release[0] !== '/'){
                    release = '/' + release;
                }
            } else {
                release = this.subpath;
            }
            this.release = normalizePath(release, reg, rExt);
            this.url = this.url ? normalizePath(this.url, reg, rExt) : this.release;
        }
        
        //charset
        if(this._isText){
            this.charset = (
                this.charset || fis.config.get('project.charset', 'utf8')
            ).toLowerCase();
        }
        
        //file id
        var id = this.id || subpath.replace(/^\//, '');
        var ns = fis.config.get('namespace');
        if(ns) {
            id = ns + fis.config.get('namespaceConnector', ':') + id;
        }
        this.id = id;
    }
}, {
    exists : function(){
        return fis.util.exists(this.realpath);
    },
    isText : function(){
        return this._isText;
    },
    isImage : function(){
        return this._isImage;
    },
    toString : function(){
        return this.realpath;
    },
    getMtime : function(){
        return fis.util.mtime(this.realpath);
    },
    isFile : function(){
        return fis.util.isFile(this.realpath);
    },
    isDir : function(){
        return fis.util.isDir(this.realpath);
    },
    setContent : function(c){
        this._content = c;
        return this;
    },
    getContent : function(){
        if(typeof this._content === 'undefined'){
            this._content = fis.util.read(this.realpath, this.isText());
        }
        return this._content;
    },
    getHash : function(){
        if(typeof this._hash === 'undefined'){
            this._hash = fis.util.md5(this.getContent());
        }
        return this._hash;
    },
    getBase64 : function(prefix){
        prefix = typeof prefix === 'undefined' ? true : prefix;
        if(prefix){
            prefix = 'data:' + fis.util.getMimeType(this.rExt) + ';base64,';
        } else {
            prefix = '';
        }
        return prefix + fis.util.base64(this._content);
    },
    getId : function(){
        return this.id;
    },
    getUrl : function(withHash, withDomain){
        var url = this.url;
        if(withHash && this.useHash){
            url = addHash(url, this);
        }
        if(withDomain && this.useDomain){
            if(typeof this.domain === 'undefined'){
                this.domain = getDomain(this.subpath);
            }
            url = this.domain + url;
        }
        return url + this.query;
    },
    getHashRelease : function(release){
        release = release || this.release;
        if(release){
            if(this.useHash){
                return addHash(release, this);
            } else {
                return release;
            }
        } else {
            fis.log.error('unreleasable file [' + this.realpath + ']');
        }
    },
    addRequire : function(id){
        if(id && (id = id.trim())){
            if(this.requires.indexOf(id) < 0){
                this.requires.push(id);
            }
            return id;
        }
        return false;
    },
    addSameNameRequire : function(ext){
        var path;
        if(fis.util.isFile(this.realpathNoExt + ext)){
            path = './' + this.filename + ext;
        } else {
            var map = fis.config.get('roadmap.ext');
            for(var key in map){
                if(map.hasOwnProperty(key)){
                    var oExt = normalizeExt(key);
                    var rExt = normalizeExt(map[key]);
                    if(rExt === ext && fis.util.isFile(this.realpathNoExt + oExt)) {
                        path = './' + this.filename + oExt;
                        break;
                    }
                }
            }
        }
        if(path){
            var info = fis.uri.getId(path, this.dirname);
            this.addRequire(info.id);
        }
    },
    removeRequire : function(id){
        var pos = this.requires.indexOf(id);
        if(pos > -1){
            this.requires.splice(pos, 1);
        }
    }
});

module.exports = File.factory();
module.exports.wrap = function(file){
    if(typeof file === 'string'){
        return new File(file);
    } else if(file instanceof File){
        return file;
    } else {
        fis.log.error('unable to convert [' + (typeof file) + '] to [File] object.');
    }
};