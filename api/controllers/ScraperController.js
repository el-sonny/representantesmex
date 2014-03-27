/**
 * ScraperController.js 
 *
 * @description ::
 * @docs        :: http://sailsjs.org/#!documentation/controllers
 */

module.exports = {
	test: function(req,res){
		Diputado.find(req.param('id')).populate('comisiones').exec(function(e,d){
			if(e) throw(e);
			d = d[0];
			d.comisiones.add("11");
			d.save(function(e,d){
				if(e) console.log(e);
				console.log(d);
				res.json(d);
				return;
			});
		});
	},
	//Escrapea por fraccion parlamentaria pasada por GET como id los ids de partidos son = {1,2,3,4,5,6,12}
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
	curricula : function(req,res){
		scraperRequires();
		var first_record = req.param('id') * 20;
		Diputado.find({limit:20,skip:first_record}).exec(function(err, diputados){
			if(err) throw err;
			numSaved = 0;
			diputados.forEach(function(diputado){
				scrapeSingleDiputado(diputado,function(e,d){
					if(e) console.log (e);
					numSaved++;
					if(numSaved == diputados.length){
						console.log(numSaved+' diputados procesados');
						res.json(diputados);
					}
				});
			});
		});
	},
	curriculum : function(req,res){
		scraperRequires();
		Diputado.findOne(req.param('id')).exec(function(e,d){
			if(e) throw e;
			scrapeSingleDiputado(d,function(e,d){
				if(e) console.log(e);
				//res.json(d);
			},res);
		});
	},
	// Escrapea por tipo de comision {1,2,3,4,6,7,8,10,12,13,16,18,21}
	comisiones : function(req,res){
		scraperRequires();
		var tipo_id = req.param('id');
		request.get({
			uri: 'http://sitl.diputados.gob.mx/LXII_leg/listado_de_comisioneslxii.php?tct='+tipo_id,
			encoding: null
		},function(err, resp, body){
			if (err) throw err;
			body = iconv.decode(body, 'iso-8859-1');
			var $ = cheerio.load(body);
			var name = $('.EncabezadoVerde').text().replace('Listado de ','').trim();
			Tipo_de_comision.findOrCreate({id:tipo_id},{id:tipo_id,nombre:name}).exec(function(e,t){
				if(e) throw(e); 
				$("a[href*='integrantes_de_comisionlxii']").each(function(){
					var comision = {
						id : $(this).attr('href').replace('integrantes_de_comisionlxii.php?comt=',''),
						name : $(this).text().trim(),
						ubicacion : $(this).parent().next().text(),
						extension : $(this).parent().next().next().text(),
						micrositio : $(this).parent().next().next().next().children('a').attr('href'),
						tipo: t.id
					};
					Comision.findOne(comision.id,function(e,c){
						if(!c){
							Comision.create(comision,function(e,c){
								if(e) throw(e);
								console.log('create',c);
								return res.send();
							})
						}else{
							c.update(comision.id,comision,function(e,c){
								if(e) throw (e);
								console.log('update',c);
							});	
						}
					});
					
				});
			});
		});
		res.send();
	}

};
function scraperRequires(){
	cheerio = require('cheerio');
	request = require('request');
	iconv = require('iconv-lite');
}
function scrapeSingleDiputado(diputado,callback,res){	
	request.get({
		uri : 'http://sitl.diputados.gob.mx/LXII_leg/curricula.php?dipt='+diputado.id,
		encoding : null, 
	},function(err, resp, body){
		if(err) console.log(err);
		body = iconv.decode(body, 'iso-8859-1');			
		$ = cheerio.load(body);

		//Datos Generales
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
		
		//Comisiones
		$("a[href*='integrantes_de_comisionlxii']").each(function(){
			var id = $(this).attr('href').replace('integrantes_de_comisionlxii.php?comt=','');
			var name = $(this).text().replace(/\(.*\)/i,'').trim();
			
			Comision.findOrCreate({id:id},{id:id,nombre:name}).populate('diputados').exec(function(e,c){
				if(e){ 
					console.log('comision error',id,name,diputado.id);
					throw e;
				}else{
					c.diputados.add(diputado.id);
					c.save();
				}
			});
		});	

		//Ridiculums
		var removeDiacritics = require('diacritics').remove;
		var concepto = false;
		var curriculum = {};
		$('body > tr:nth-child(2) table > tr').each(function(){
			if($(this).children('td').hasClass('TitulosVerde')){
				concepto = removeDiacritics($(this).text().trim().toLowerCase().replace(/ /g,'_'));
				curriculum[concepto] = [];
			}else{
				if(concepto){
					curriculum[concepto].push({
						posicion : $(this).children('td').eq(0).text().trim(),
						organizacion : $(this).children('td').eq(1).text().trim(),
						fecha : $(this).children('td').eq(2).text().trim(),
					});

				}else{
					//error TODO
					console.log('erroor');
				}
			};
		});
		diputado.curriculum = curriculum;
		//console.log(curriculum);
		res.json(curriculum);
		
		//process.exit(0);
		//return callback;



		diputado.save(callback);
	});
}