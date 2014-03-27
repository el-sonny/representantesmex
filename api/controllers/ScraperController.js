/**
 * ScraperController.js 
 *
 * @description ::
 * @docs        :: http://sailsjs.org/#!documentation/controllers
 */

procesados = 0;

module.exports = {
	//Escrapea listado de diputados por partido 
	//TODO Crear modelo para partido y conectarlo a diputado
	plantillas: function(req, res) {
		async.mapSeries([1,2,3,4,5,6,12],scrapePartido,function(e,d){
			if(e) console.log(e);
			res.json(d);
		});
	},
	//Escrapea la información en la pagina de curriculum para todos los diputados en la db 
	//!warning es secuencial y tarda un monton porque va 1 pagina a la vez (para evitar rechasos de coneccion del servidor de los diputables)
	curricula : function(req,res){
		requires();
		Diputado.find({}).exec(function(e, diputados){
			if(e) throw e;
			async.mapSeries(diputados,scrapeSingleDiputado,function(e,diputados){
				if(e) throw e;
				res.json(diputados);
			});
		});
	},
	//Escrapea un diputado
	curriculum : function(req,res){
		requires();
		Diputado.findOne(req.param('id')).exec(function(e,d){
			if(e) throw e;
			scrapeSingleDiputado(d,function(e,d){
				if(e) throw(e);
				res.json(d);
			},res);
		});
	},
	// Escrapea tipos de comision
	comisiones : function(req,res){
		requires();
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
					Comision.update(comision.id,comision,function(e,c){
						if(e){
							Comision.create(comision,function(e,c){
								if(e) throw (e); 
								console.log('create',c.id);
							});		
						}else{
							console.log('update',comision.id);
						}
					});				
				});
				res.json(t);
			});
		});
		//res.send();
	}

};
function requires(){
	cheerio = require('cheerio');
	request = require('request');
	iconv = require('iconv-lite');
	require('async');
}
function scrapePartido(partido,callback){
	requires();
	request.get({
		uri: 'http://sitl.diputados.gob.mx/LXII_leg/listado_diputados_gpnp.php?tipot='+partido,
		encoding: null
	},function(err, resp, body) {
		if (err) throw err;
		body = iconv.decode(body, 'iso-8859-1');
		var $ = cheerio.load(body);
		var diputados = [];
		$('.linkVerde').each(function(){
			diputados.push({
				"id" : $(this).attr('href').replace('curricula.php?dipt=',''),
				"nombre" : $(this).text().split(' ').splice(1).join(' '),
				"entidad" : $(this).parent().next().text(),
				"partido" : partido
			});
		});
		procesados += diputados.length;
		console.log('diputad@s procesad@s: '+procesados);
		async.map(diputados,Diputado.create,callback);
	});
}

function scrapeSingleDiputado(diputado,callback){	
	request.get({
		uri : 'http://sitl.diputados.gob.mx/LXII_leg/curricula.php?dipt='+diputado.id,
		encoding : null, 
	},function(err, resp, body){
		if(err) console.log(err);
		body = iconv.decode(body, 'iso-8859-1');			
		$ = cheerio.load(body);

		scrapeComisiones(diputado,callback);
		procesados++
		console.log('diputad@ #'+procesados+' 	id:'+diputado.id+' procesado');
		//diputado.save(callback);
	});
}
function scrapeDiputadoGeneral(diputado,callback){
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
			}
		};
	});
	diputado.curriculum = curriculum;
}
function scrapeComisiones(diputado,callback){
	//Comisiones
	var comisiones = [];
	$("a[href*='integrantes_de_comisionlxii']").each(function(){
		comisiones.push({
			id : $(this).attr('href').replace('integrantes_de_comisionlxii.php?comt=',''),
			name : $(this).text().replace(/\(.*\)/i,'').trim()
		});
	});
	async.each(comisiones,
		function(comision,_callback){
			Comision.findOrCreate({id:comision.id},comision,function(e,c){
				if(c){
					diputado.comisiones.add(c);
				}
				_callback(e);
			});
		},
		function(e){
			if(e) throw(e);
			diputado.save(callback);
		}
	);

}