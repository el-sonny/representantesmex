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
				if(e) console.log(e);
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
	//Escrapea las listas de todas las comisiones tarda tambien son 211 comisiones entonces 211 request uno por uno
	comisiones: function(req,res){
		requires();
		Comision.find({},function(e,comisiones){
			if(e) throw(e);
			async.mapSeries(comisiones,scrapeComision,function(e,c){
				if(e) throw(e);
				console.log('done');
				res.json(c);
			});
		});
	},
	periodos: function(req,res){
		requires();
		request.get({
			uri : 'http://sitl.diputados.gob.mx/LXII_leg/votaciones_por_periodonplxii.php',
			encoding: null
		},function(err, resp, body){
			if (err) throw err;
			body = iconv.decode(body, 'iso-8859-1');
			var $ = cheerio.load(body);
			var periodos = [];
			$("a[href*='votacionesxperiodonplxii.php?pert=']").each(function(){
				periodos.push({
					id: $(this).attr('href').replace('votacionesxperiodonplxii.php?pert=','').trim(),
					nombre : $(this).text().trim()
				});
			});
			async.mapSeries(periodos,function(p,c){Periodo.findOrCreate(p,p,c)},function(e,p){
				if(e) throw(e);
				res.json(p);
			});
		});
	},
	//Nota la sesion 1 no la escrapea porque no sale en el calendario del periodo 1 tssss :S
	sesiones: function(req,res){
		requires();	
		Periodo.find({},function(e,periodos){
			if(e) throw (e);
			async.mapSeries(periodos,scrapeSesiones,function(e,sesiones){
				if(e) throw(e);
				res.json(sesiones);
			});
		});
	},

	asistencias: function(req,res){
		requires();
		//Por sesion y partido, reemplazando para hacerlo por diputado
		/*Sesion.find({},function(e,sesiones){
			if(e) throw(e);
			async.mapSeries(sesiones,scrapeAsistencias,function(e,asistencias){
				if(e) throw(e);
				res.json(asistencias);
			});
		});*/
		Diputado.findOne(req.param('id'),function(e,diputado){
			if(e) throw(e);
			Periodo.find({},function(e,periodos){
				if(e) throw(e);
				async.mapSeries(
					periodos,
					function(periodo,cb){
						asistenciasPorDiputado(diputado,periodo,cb);
					},
				function(e,asistencias){
					if(e) throw(e);
					res.json(asistencias);
				});
			});
		});
	},
	votaciones : function(req,res){
		requires();
		Diputado.findOne(req.param('id'),function(e,diputado){
			if(e) throw(e);
			Periodo.find({},function(e,periodos){
				if(e) throw(e);
				async.mapSeries(
					periodos,
					function(periodo,cb){
						votacionesPorDiputado(diputado,periodo,cb);
					},
				function(e,votaciones){
					if(e) throw(e);
					res.json(votaciones);
				});
			});
		});
	}
};
function votacionesPorDiputado(diputado,periodo,callback){
	var meses = {'Enero' : 1,'Febrero' : 2,'Marzo' : 3,'Abril' : 4,'Mayo' : 5,'Junio' : 6,'Julio' : 7,'Agosto' : 8,'Septiembre' : 9,'Octubre' : 10,'Noviembre' : 11,'Diciembre' : 12};
	request.get({
		uri : 'http://sitl.diputados.gob.mx/LXII_leg/votaciones_por_pernplxii.php?iddipt='+diputado.id+'&pert='+periodo.id,
		encoding : null, 
	},function(err, resp, body){
		if(err) return callback(err,null);
		body = iconv.decode(body, 'iso-8859-1');			
		$ = cheerio.load(body);
		var votaciones = [];
		var sentidos = [];
		var fecha = ''; 
		var resumen = diputado.resumen_de_votaciones ? diputado.resumen_de_votaciones : {"A favor": 0,"En contra": 0,"Ausente": 0};
		$("tr[bgcolor='#5C7778']").nextUntil($('tr:last-child')).each(function(){
			if($(this).children().length == 1){
				fecha = $(this).text().trim().split(' ');
				fecha = [fecha[2],meses[fecha[1]],fecha[0]].join('-');
			}else if($(this).children().length == 4){				
				var sentido = $(this).children('td:nth-child(4)').text();
				sentidos.push(sentido);
				resumen[sentido]++;
				votaciones.push({
					fecha : fecha,
					orden : $(this).children('td:nth-child(1)').text().trim(),
					titulo : $(this).children('td:nth-child(2)').text().trim(),
				});
			};			
		});
		async.map(votaciones,function(v,c){Votacion.findOrCreate(v,v,c)},function(e,votaciones){
			var votaciones_diputado = [];
			var i = 0;
			votaciones.forEach(function(votacion){
				votaciones_diputado.push({
					votacion : votacion.id,
					diputado : diputado.id,
					sentido : sentidos[i++]
				});
			});
			async.map(votaciones_diputado,function(v,c){Diputado_votacion.findOrCreate(v,v,c)},function(e,v){
				diputado.resumen_de_votaciones = resumen;
				diputado.save(callback);
			});
		});	

	});

}
function asistenciasPorDiputado(diputado,periodo,callback){
	var meses = {'Enero' : 1,'Febrero' : 2,'Marzo' : 3,'Abril' : 4,'Mayo' : 5,'Junio' : 6,'Julio' : 7,'Agosto' : 8,'Septiembre' : 9,'Octubre' : 10,'Noviembre' : 11,'Diciembre' : 12};
	request.get({
		uri : 'http://sitl.diputados.gob.mx/LXII_leg/asistencias_por_pernplxii.php?iddipt='+diputado.id+'&pert='+periodo.id,
		encoding : null, 
	},function(err, resp, body){
		if(err) return callback(err,null);
		body = iconv.decode(body, 'iso-8859-1');			
		$ = cheerio.load(body);
		var fechas = [];
		var valores = [];
		var asistencias = [];
		var resumen = diputado.resumen_de_asistencias ? diputado.resumen_de_asistencias : {"A": 0,"AC": 0,"AO": 0,"PM": 0,"IJ": 0,"I": 0,"IV": 0,"total": 0};
		$("td[bgcolor*='D6E2E2']").each(function(){
			var dia_valor = $(this).children().children().html().split('<br>');
			var mes_anio = $(this).parent().parent().children('tr:first-child').children().children().text().trim().split(' ');
			var fecha = [mes_anio[1],meses[mes_anio[0]],dia_valor[0]].join('-');
			var multi = dia_valor[1].match(/(.+)\/(.+)/);
			if(multi){
				valores.push(multi[1],multi[2]);
				resumen[multi[1]] = resumen[multi[1]] ? resumen[multi[1]]+1 : 1;
				resumen[multi[2]] = resumen[multi[2]] ? resumen[multi[2]]+1 : 1;
				resumen['total'] = resumen['total'] ? resumen['total']+2 : 1;


			}else{
				valores.push(dia_valor[1]);
				resumen[dia_valor[1]] = resumen[dia_valor[1]] ? resumen[dia_valor[1]]+1 : 1;
				resumen['total'] = resumen['total'] ? resumen['total']+1 : 1;
			}
			fechas.push(fecha);
		});
		var i = 0;
		Sesion.find({fecha:fechas},function(e,sesiones){
			if(e) return callback(e,null);
			sesiones.forEach(function(sesion,index){
				asistencias.push({
					sesion:sesion.id,
					diputado:diputado.id,
					valor : valores[i++],
				});
			});
			async.map(asistencias,function(a,c){Asistencia.findOrCreate(a,a,c)},function(e,asistencias){
				Diputado.find(diputado.id,function(e,d){
					diputado.resumen_de_asistencias = resumen;
					diputado.save(callback);
				});
			});
		});		
	});
}
function scrapeAsistencias(sesion,callback){
	request.get({
		uri : 'http://sitl.diputados.gob.mx/LXII_leg/listados_asistenciasnplxii.php?partidot=1&sesiont='+sesion.id,
		encoding : null, 
	},function(err, resp, body){
		if(err) console.log(err);
		body = iconv.decode(body, 'iso-8859-1');			
		$ = cheerio.load(body);
		var asistencias = [];
		$("a[href*='asistencias_por_pernplxii.php?iddipt=']").each(function(){
			asistencias.push({
				diputado : $(this).attr('href').replace('asistencias_por_pernplxii.php?iddipt=','').replace('&pert=',',').split(',')[0],
				valor : $(this).parent().parent().next().children().text().trim(),
				sesion : sesion.id,
			});
		});
		procesados++
		console.log('asistencias de '+procesados+' sesiones procesadas');
		async.map(asistencias,Asistencia.create,callback);
	});
}
function scrapeSesiones(periodo,callback){
	request.get({
		uri : 'http://sitl.diputados.gob.mx/LXII_leg/asistencias_diputados_calendarionplxii.php?pert='+periodo.id,
		encoding : null, 
	},function(err, resp, body){
		if(err) console.log(err);
		body = iconv.decode(body, 'iso-8859-1');			
		$ = cheerio.load(body);
		var sesiones = [];
		var meses = {
			'Enero' : 1,
			'Febrero' : 2,
			'Marzo' : 3,
			'Abril' : 4,
			'Mayo' : 5,
			'Junio' : 6,
			'Julio' : 7,
			'Agosto' : 8,
			'Septiembre' : 9,
			'Octubre' : 10,
			'Noviembre' : 11,
			'Diciembre' : 12
		};
		$("a[href*='asisteinifinsesionnplxii.php?sesiont=']").each(function(){
			var string = $(this).parent().parent().parent().parent().parent().children('tr:nth-child(1)').children().children().text().trim().split(" ");
			var dia = $(this).text().trim();
			var mes = meses[string[0]];
			var anio = string[1];
			var turno = null;
			if(dia == 'M' || dia == 'V'){
				dia = parseInt($(this).parent().parent().parent().prev().children().children().children().text().trim())+1;
				turno = $(this).text().trim();
			}
			var sesion = {
				id : $(this).attr('href').replace('asisteinifinsesionnplxii.php?sesiont=','').trim(),
				fecha : anio+'-'+mes+'-'+dia,
				periodo : periodo.id
			}
			if(turno) sesion.turno = turno;
			sesiones.push(sesion);
		});
		async.map(sesiones,Sesion.create,callback);
	});
}
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

	diputado.imagen = $("img[src*='./fotos_lxiiconfondo/']").attr('src').replace('./','http://sitl.diputados.gob.mx/LXII_leg/');
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