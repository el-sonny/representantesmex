/**
 * ScraperController.js 
 *
 * @description ::
 * @docs        :: http://sailsjs.org/#!documentation/controllers
 */

module.exports = {
	diputados: function(req, res) {
		scraperRequires();
		var partido = req.param('id');
		request.get({
			uri: 'http://sitl.diputados.gob.mx/LXII_leg/listado_diputados_gpnp.php?tipot='+partido,
			encoding: null
		},function(err, resp, body) {
			if (err) throw err;
			body = iconv.decode(body, 'iso-8859-1');
			var $ = cheerio.load(body);
			$('.linkVerde').each(function(){
				diputado = {
					"id" : $(this).attr('href').replace('curricula.php?dipt=',''),
					"nombre" : $(this).text().split(' ').splice(1).join(' '),
					"entidad" : $(this).parent().next().text(),
					"partido" : partido
				}
				Diputado.create(diputado).done(function(err, user){
					if (err) return console.log(err);
				});
			});
			Diputado.find({}).done(function(err, diputados){
				res.json(diputados);	
			});
		});
	},
	allCurriculums : function(req,res){
		scraperRequires();
		Diputado.find({}).done(function(err, diputados){
			if(err) throw err;
			numSaved = 0;
			diputados.forEach(function(diputado){scrapeSingleDiputado(diputado,saveDiputado)});
		});
	},
	singleCurriculum : function(req,res){
		scraperRequires();
		Diputado.find(req.param('id'),function(e,d){
			if(e) throw e;
			scrapeSingleDiputado(d[0],function(e,d){
				if(e) console.log(e);
				res.send(d);
			});
		});
	},

};
function scraperRequires(){
	cheerio = require('cheerio');
	request = require('request');
	iconv = require('iconv-lite');
}
function scrapeSingleDiputado(diputado,callback){	
	request.get({
		uri : 'http://sitl.diputados.gob.mx/LXII_leg/curricula.php?dipt='+diputado.id,
		encoding : null, 
	},function(err, resp, body){
		if(err) throw err;
		body = iconv.decode(body, 'iso-8859-1');			
		$ = cheerio.load(body);

		var bodySummary = $('body').text().replace(/[\n|\t| ]+/gi,' ');
		var dchelper = bodySummary.match(/(Distrito|Circunscripción): (.*) Cabecera:/i);
		var suplente = bodySummary.match(/Suplente( de)?: (.*) Onomástico:/i);
		var email = bodySummary.match(/([0-9a-zA-Z]([-\.\w]*[0-9a-zA-Z])*@([0-9a-zA-Z][-\w]*[0-9a-zA-Z]\.)+[a-zA-Z]{2,9})/i);

		if(suplente){
			if(suplente[1] == ' de'){
				diputado.suplente_de = suplente[2];
				diputado.propietario = false;
			}else{
				diputado.suplente = suplente[2];
				diputado.propietario = true;
			}						
		}else{
			console.log('suplente error:'+diputado.id);
		}

		diputado[dchelper[1].toLowerCase()] = dchelper[2];
		diputado.email = email ? email[0] : false;
		diputado.curul = bodySummary.match( /Curul: (.*?) (Suplente( de)?|Onomástico):/i)[1];
		diputado.tipo_de_eleccion = bodySummary.match( /Tipo de elección: (.*) Entidad:/i)[1];
		
		$("a[href*='integrantes_de_comisionlxii']").each(function(){
			var id = $(this).attr('href').replace('integrantes_de_comisionlxii.php?comt=','');
			var name = $(this).text().replace(/\(.*\)/i,'').trim();
			Comision.findOrCreate({id:id},{id:id,nombre:name}).exec(function(e,c){
				if(e) throw e;
				diputado.comisiones.add(c.id);
			});
		});	
		diputado.save(callback);
	});
}
var saveDiputado = function(e,d){
	if(e) throw (e);
	numSaved++;
	console.log(numSaved+' diputados procesados');
}