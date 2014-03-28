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
	integrantes: function(req, res) {
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
				//if(e) throw e;
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
				//if(e) console.log(e);
				res.json(d);
			});
		});
	},
	// Escrapea tipos de comision
	tipos_de_comisiones : function(req,res){
		requires();
		async.mapSeries([1,2,3,4,6,7,8,10,12,13,16,18,21],scrapeTipoComision,function(e,c){
			if(e) throw (e);
			console.log('done');
			res.json(c);
		});
	},
	//Escrapea las listas de todas las comisiones
	comisiones: function(req,res){
		requires();
		Comision.find({},function(e,comisiones){
			if(e) throw(e);
			async.mapSeries(comisiones,scrapeComision,function(e,c){
				if(e) throw(e);
				res.json(c);
			});
		});
	},
	periodos: function(req,res){
		requires();
		request.get({
			uri : 'http://sitl.diputados.gob.mx/LXII_leg/asistencias_diputados_todosnplxii.php',
			encoding: null
		},function(err, resp, body){
			if (err) throw err;
			body = iconv.decode(body, 'iso-8859-1');
			var $ = cheerio.load(body);
			var periodos = [];
			$("a[href*='asistencias_diputados_calendarionplxii.php']").each(function(){
				periodos.push({
					id: $(this).attr('href').replace('asistencias_diputados_calendarionplxii.php?pert=','').trim(),
					nombre : $(this).text().trim()
				});
			});
			Periodos.create(periodos,function(e,p){
				if(e) throw(e);
				res.json(p);
			});
		});
	},
	
};
function requires(){
	cheerio = require('cheerio');
	request = require('request');
	iconv = require('iconv-lite');
	require('async');
}
function scrapeComision(comision,callback){
	request.get({
		uri: 'http://sitl.diputados.gob.mx/LXII_leg/integrantes_de_comisionlxii.php?comt='+comision.id,
		encoding: null
	},function(err, resp, body){
		if (err) throw err;
		body = iconv.decode(body, 'iso-8859-1');
		var $ = cheerio.load(body);
		var diputados = [];
		var ids = [];


		$("a[href*='curricula.php?dipt=']").each(function(){
			var id = parseInt($(this).attr('href').replace('curricula.php?dipt=','').trim());
			//Aprovechamos para guardar informacion extra de los legisladores
			diputados.push({
				id : id,
				ubicacion : $(this).parent().next().next().next().text().trim(),
				extension : $(this).parent().next().next().next().next().text().trim(),
			});
			ids.push({id:id});
			comision.diputados.add(id);
		});
		async.map(diputados,function(diputado,cb){
			Diputado.update(diputado.id,diputado,cb);
		},
		function(e,r){
			comision.save(function(err,c){
				//if(err) console.log(err);
				procesados++;
				console.log('comisiones procesadas '+procesados+' comision: '+comision.id);
				callback(e,c);
			})
		});
	});
}
function scrapeTipoComision(tipo,callback){
	request.get({
		uri: 'http://sitl.diputados.gob.mx/LXII_leg/listado_de_comisioneslxii.php?tct='+tipo,
		encoding: null
	},function(err, resp, body){
		if (err) throw err;
		body = iconv.decode(body, 'iso-8859-1');
		var $ = cheerio.load(body);
		var name = $('.EncabezadoVerde').text().replace('Listado de ','').trim();
		Tipo_de_comision.findOrCreate({id:tipo},{id:tipo,nombre:name}).exec(function(e,t){
			if(e) throw(e); 
			var comisiones = [];
			var ids = [];
			$("a[href*='integrantes_de_comisionlxii']").each(function(){
				comisiones.push({
					id : $(this).attr('href').replace('integrantes_de_comisionlxii.php?comt=',''),
					name : $(this).text().trim(),
					ubicacion : $(this).parent().next().text(),
					extension : $(this).parent().next().next().text(),
					micrositio : $(this).parent().next().next().next().children('a').attr('href'),
					tipo: t.id
				});
			});
			async.map(comisiones,
				function(comision,cb){
					Comision.findOrCreate(comision.id,comision,function(e,c){
						Comision.update(c.id,comision,cb);
						procesados++;
						console.log('Comisiones Procesadas: '+procesados+'	comision #'+c.id);
					});
				},
				callback
			)
			
		});
	});
}
function scrapePartido(partido,callback){
	requires();
	request.get({
		uri: 'http://sitl.diputados.gob.mx/LXII_leg/listado_diputados_gpnp.php?tipot='+partido,
		encoding: null
	},function(err, resp, body){
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
		async.series(
			[
				function(_callback){scrapeDiputadoGeneral(diputado,_callback)},
				function(_callback){scrapeComisiones(diputado,_callback)},
			],
			function(e,d){
				procesados++
				console.log('diputad@ #'+procesados+' 	id:'+diputado.id+' procesado');
				callback(e,d);
			}	
		);
	});
}
function scrapeDiputadoGeneral(diputado,callback){
	//Datos Generales

	var bodySummary = $('body').text().replace(/[\n|\t| ]+/gi,' ');
	var dchelper = bodySummary.match(/(Distrito|Circunscripción): (.*) Cabecera:/i);
	var suplente = bodySummary.match(/Suplente( de)?: (.*) Onomástico:/i);
	var email = bodySummary.match(/([0-9a-zA-Z]([-\.\w]*[0-9a-zA-Z])*@([0-9a-zA-Z][-\w]*[0-9a-zA-Z]\.)+[a-zA-Z]{2,9})/i);

	if(suplente){
		if(suplente[0] == ' de'){
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
	diputado.save(callback);
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
				_callback();
			});
		},
		function(e){
			if(e) throw(e);
			diputado.save(function(e,d){
				callback(null,d);
			});
		}
	);

}